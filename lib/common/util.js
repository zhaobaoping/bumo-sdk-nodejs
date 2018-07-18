'use strict';

const request = require('request-promise');
const is = require('is-type-of');
const long = require('long');
const JSONbig = require('json-bigint');
// const bigNumberToString = require('bignumber-to-string')
const BigNumber = require('bignumber.js');
const protobuf = require("protobufjs");
const tou8 = require('buffer-to-uint8array');
const { keypair, signature } = require('bumo-encryption');
const errors = require('../exception');


const proto = exports;


/**
 * GET/POST request
 *
 * @param  {String} method
 * @param  {String} path
 * @param  {Object} data
 * @return {Object}
 */
proto._request = function* (method, path, data = {}) {
  try {
    const protocol = this.options.secure ? 'https://' : 'http://';
    const uri = `${protocol}${this.options.host}/${path}`;

    if (!is.string(method) || this._isEmptyString(method)) {
      throw new Error('method must be a non-empty string');
    }

    if (!is.string(path) || this._isEmptyString(path)) {
      throw new Error('path must be a non-empty string');
    }

    const methods = [ 'get', 'post' ];

    if (!methods.includes(method.toLowerCase())) {
      throw new Error(`${method} http method is not supported`);
    }

    const options = {
      method,
      uri,

    };

    if (method === 'get') {
      options.qs = data;
    }

    if (method === 'post') {
      options.body = data;
    }
    const result = yield request(options);
    const obj = JSONbig.parse(result);
    const error_code = obj.error_code;
    const final =  this._bigNumberToString(obj);
    final.error_code = error_code;
    return final;
  } catch (err) {
    throw err;
  }
};

proto._response = function(obj) {
  const data = {
    errorCode: obj.error_code || 0,
    errorDesc: obj.error_desc || 'Success',
  };

  if (is.object(obj) && obj.error_code) {
    if (obj.error_code === 0) {
      data.result = obj.result || {};
    } else {
      data.errorDesc = obj.error_desc || '';
      data.result = {};
    }
  } else {
    data.result = obj;
  }

  return JSONbig.stringify(data);
};

proto._getBlockNumber = function* () {
  try {
    const data = yield this._request('get', 'getLedger');

    if (data && data.error_code === 0) {
      console.log('+++++++++')
      console.log(data.result);

      console.log('+++++++++')
      const seq = data.result.header.seq;
      return this._responseData({
        header: data.result.header,
        blockNumber: seq,
      });
    } else {
      return this._responseError(errors.INTERNAL_ERROR);
    }
  } catch (err) {
    throw err;
  }
};

proto._isEmptyString = function(str) {
  if (!is.string(str)) {
    throw new Error('str must be a string');
  }
  return (str.trim().length === 0);
};

proto._postData = function(blob, signature) {
  const data = {
    items: [
      {
        transaction_blob: blob,
        signatures: signature
      },
    ],
  };
  return JSONbig.stringify(data);
};

proto._isBigNumber = function (object) {
  return object instanceof BigNumber ||
      (object && object.constructor && object.constructor.name === 'BigNumber');
};

proto._toBigNumber = function(number) {
  number = number || 0;
  //
  if (this._isBigNumber(number)) {
    return number;
  }
  return new BigNumber(number);
};

proto._stringFromBigNumber = function(number) {
  return this._toBigNumber(number).toString(10);
};

proto._verifyValue = function(str) {
  const reg = /^[1-9]\d*$/;
  return (
      is.string(str) &&
      reg.test(str) &&
      long.fromValue(str).greaterThan(0) &&
      long.fromValue(str).lessThanOrEqual(long.MAX_VALUE)
  );
};

proto._checkParams = function (obj) {
  for (let prop in obj) {
    if (obj.hasOwnProperty(prop)) {
      let value = obj[prop];
      if (!is.undefined(value)) {
        if (!this._verifyValue(value)) {
          throw new Error(errors.INVALID_FORMAT_OF_ARG.msg);
        }
      }
    }
  }
};

proto._getDefaultValue = function* () {
  try {
     let ledgerInfo = yield this._request('get', 'getLedger', {
      with_fee: true,
    });
    const gasPrice = long.fromValue(ledgerInfo.result.fees.gas_price);
    const feeLimit = long.fromValue(1000).mul(gasPrice);
    return {
      gasPrice,
      feeLimit,
    }
  } catch (err) {
    throw err;
  }
};

proto._responseData = function(data) {
  const errorCode = 0;
  const errorDesc = '';

  return {
    errorCode,
    errorDesc,
    result: data,
  }
};

proto._responseError = function(message) {
  if (!message) {
    throw new Error('require message');
  }
  const errorCode = message.CODE;

  return {
    errorCode,
    errorDesc: message.MSG,
  };
};

proto._submitTransaction = function* (data) {
  try {
    const res = yield this._request('post', 'submitTransaction', data);
    const results = res.results;
    if (Array.isArray(results) && results.length > 0) {
      const info = results[0];

      if (info.error_code === '0') {
        return this._responseData({
          hash: info.hash,
        });
      }
      let err = {};
      switch (info.error_code) {
        case 93:
          err = errors.NOT_ENOUGH_WEIGHT;
          break;
        case 99:
          err = errors.NONCE_INCORRECT;
          break;
        case 100:
          err = errors.BU_IS_NOT_ENOUGH;
          break;
        case 101:
          err = errors.SOURCEDEST_EQUAL;
          break;
        case 102:
          err = errors.DEST_ACCOUNT_EXISTS;
          break;
        case 103:
          err = errors.ACCOUNT_NOT_EXIST;
          break;
        case 104:
          err = errors.ACCOUNT_ASSET_LOW_RESERVE;
          break;
        case 106:
          err = errors.ACCOUNT_INIT_LOW_RESERVE;
          break;
        case 111:
          err = errors.FEE_NOT_ENOUGH;
          break;
        case 160:
          err = errors.DISCARD_TRANSACTION;
          break;
        default:
          err = errors.TRANSACTION_FAIL;
      }

      return this._responseError(err);
    }

  } catch (err) {
    throw err;
  }

};

proto._buildOperation = function(type, data) {
  try {
    return require(`./operation/${type}`)(data);
  } catch (err) {
    throw new Error('Operation cannot be resolved');
  }
};

proto._decodeOperation = function(hexString) {
  const root = protobuf.Root.fromJSON(require('../crypto/protobuf/bundle.json'));
  const operation = root.lookupType('protocol.Operation');
  const msgBuffer = Buffer.from(hexString, 'hex');
  return operation.decode(msgBuffer);
};

proto._buildBlob = function(args) {
  try {
    let { sourceAddress, gasPrice, feeLimit, nonce, ceilLedgerSeq, operations, metadata } = args;

    const operationList = [];

    operations.forEach(item => {
      const type = item.type;
      const argsData = item.data;

      const operationItem =  this._buildOperation(type, argsData);
      operationList.push(operationItem);
    });

    const root = protobuf.Root.fromJSON(require('../crypto/protobuf/bundle.json'));
    const tx = root.lookupType('protocol.Transaction');

    ceilLedgerSeq = ceilLedgerSeq ? long.fromValue(ceilLedgerSeq) : undefined;

    const payload = {
      sourceAddress,
      gasPrice: long.fromValue(gasPrice),
      feeLimit: long.fromValue(feeLimit),
      nonce: long.fromValue(nonce),
      ceilLedgerSeq,
      operations: operationList,
      // metadata,
    };

    if (metadata) {
      payload.metadata = tou8(Buffer.from(metadata, 'hex'));
    }

    const errMsg = tx.verify(payload);

    if (errMsg) {
      throw Error(errMsg);
    }

    const message = tx.create(payload);
    const bufferData = tx.encode(message).finish();
    // return blob
    return {
      transactionBlob: bufferData.toString('hex'),
    }
  } catch (err) {
    throw err;
  }
};

proto._signBlob = function({ privateKeys, blob } = args) {
  const buffer = Buffer.from(blob, 'hex');
  const uint8ArrayData = tou8(buffer);
  const signatureArr = [];
  privateKeys.forEach(privateKey => {
    signatureArr.push({
      signData: signature.sign(uint8ArrayData, privateKey),
      publicKey: keypair.getEncPublicKey(privateKey),
    });
  });
  // return signatureArr;
  return {
    signatures: signatureArr,
  };
};

proto._submit = function* (args) {
  const { blob, signature} = args;
  const postData = this._postData(blob, signature);
  return yield this._submitTransaction(postData);
};


proto._isOperation = function(arr) {
  let tag = true;
  if (!is.array(arr)) {
    tag = false;
  }

  arr.some(item => {
    if (!is.object(item)) {
      tag = false;
      return true;
    }
    if (!item.type || !item.data) {
      tag = false;
      return true;
    }
  });

  return tag;
};


/**
 *
 * @param obj
 * @param schema
 * @returns {boolean}
 * @private
 *
 * eg:
    schema: {
      required: false,
      string: true,
      address: true,
      numeric: true,
    }
 */
proto._validate = function(obj, schema) {
  let tag = true;
  let msg = '';

  if (!is.object(obj) || !is.object(schema)) {
    tag = false;
    msg = 'require args';
    return {
      tag,
      msg,
    };
  }

  Object.keys(schema).some(item => {

    // required is true
    if (schema[item].required && is.undefined(obj[item])) {
      obj[item] = '';
    }

    // numeric is true
    if (!is.undefined(obj[item]) &&
        schema[item].numeric &&
        !this._verifyValue(obj[item])) {
      tag = false;

      switch(item) {
        case 'buAmount':
          msg = 'INVALID_BU_AMOUNT_ERROR';
          break;
        case 'assetAmount':
          msg = 'INVALID_ASSET_AMOUNT_ERROR';
          break;
        case 'gasPrice':
          msg = 'INVALID_GASPRICE_ERROR';
          break;
        case 'feeLimit':
          msg = 'INVALID_FEELIMIT_ERROR';
          break;
        case 'ceilLedgerSeq':
          msg = 'INVALID_CEILLEDGERSEQ_ERROR';
          break;
        case 'nonce':
          msg = 'INVALID_NONCE_ERROR';
          break;
        case 'initBalance':
          msg = 'INVALID_INITBALANCE_ERROR';
          break;
        default:
          msg = 'INVALID_ARGUMENTS';
      }

      return true;
    }

    // privateKey is true
    if (!is.undefined(obj[item]) &&
        schema[item].privateKey &&
        !keypair.checkEncPrivateKey(obj[item])) {
      tag = false;
      msg = `Invalid ${item}`;
      return true;
    }

    // address is true
    if (!is.undefined(obj[item]) &&
        schema[item].address &&
        !keypair.checkAddress(obj[item])) {
      tag = false;

      switch(item) {
        case 'sourceAddress':
          msg = 'INVALID_SOURCEADDRESS_ERROR';
          break;
        case 'destAddress':
          msg = 'INVALID_DESTADDRESS_ERROR';
          break;
        default:
          msg = 'INVALID_ARGUMENTS';
      }

      return true;
    }

    // operations is true
    if (!is.undefined(obj[item]) &&
        schema[item].operations &&
        !this._isOperation(obj[item])) {
      tag = false;
      msg = 'INVALID_OPERATIONS';
      return true;
    }

    // hex is true
    if (!is.undefined(obj[item]) &&
        schema[item].hex &&
        !this._isHexString(obj[item])) {
      tag = false;
      msg = 'METADATA_NOT_HEX_STRING_ERROR';
      return true;
    }

    // string is true
    if (!is.undefined(obj[item]) &&
        schema[item].string && is.string(obj[item]) &&
        obj[item].trim().length === 0) {
      tag = false;
      msg = `${item} must be a string`;
      return true;
    }

  });

  return {
    tag,
    msg,
  };
};

proto._bufToHex = function(buf) {
  const utf8Str = buf.toString('utf8');
  return Buffer.from(utf8Str, 'utf8').toString('hex');
};

proto._bigNumberToString = function(obj, base) {
  // setup base
  base = base || 10;

  // check if obj is type object, not an array and does not have BN properties
  if (typeof obj === 'object' && obj !== null && !Array.isArray(obj) && !('lessThan' in obj)) {
    // move through plain object
    Object.keys(obj).forEach(function (key) {
      // recurively converty item
      obj[key] = proto._bigNumberToString(obj[key], base);
    })
  }

  // obj is an array
  if (Array.isArray(obj)) {
    // convert items in array
    obj = obj.map(function (item) {
      // convert item to a string if bignumber
      return proto._bigNumberToString(item, base);
    })
  }

  // if obj is number, convert to string
  if (typeof obj === 'number') return obj + '';

  // if not an object bypass
  if (typeof obj !== 'object' || obj === null) return obj;

  // if the object to does not have BigNumber properties, bypass
  if (!('toString' in obj) || !('lessThan' in obj)) return obj;

  // if object has bignumber properties, convert to string with base
  return obj.toString(base);
};


proto._longToInt = function(obj) {
  // check if obj is type object, not an array and does not have long properties
  if (typeof obj === 'object' && obj !== null && !Array.isArray(obj) && !('low' in obj)) {
    // move through plain object
    Object.keys(obj).forEach(function (key) {
      // recurively converty item
      obj[key] = proto._longToInt(obj[key]);
    })
  }

  // obj is an array
  if (Array.isArray(obj)) {
    // convert items in array
    obj = obj.map(function (item) {
      // convert item to an int if long
      return proto._longToInt(item);
    })
  }

  // if not an object bypass
  if (typeof obj !== 'object' || obj === null) return obj;

  // if the object to does not have long properties, bypass
  if (!('low' in obj)) return obj;

  // if object has long properties, convert to int
  return long.fromValue(obj).toInt();
};

proto._isHexString = function(str) {
  const hexString = Buffer.from(str, 'hex').toString('hex');
  return (hexString === str);
};