'use strict';

const wrap = require('co-wrap-all');
const is = require('is-type-of');
const merge = require('merge-descriptors');
const long = require('long');
const JSONbig = require('json-bigint');
const { keypair } = require('bumo-encryption');
const errors = require('../exception');

module.exports = Account;

function Account(options) {
  if (!(this instanceof Account)) {
    return new Account(options);
  }

  this.options = options;
}

const proto = Account.prototype;

merge(proto, require('../common/util'));

/**
 * Create account
 * @return {Object}
 */
proto.create = function* () {
  const kp = keypair.getKeyPair();
  const privateKey = kp.encPrivateKey;
  const publicKey = kp.encPublicKey;
  const address = kp.address;

  return this._responseData({
    privateKey,
    publicKey,
    address,
  });
};

/**
 * Check address
 * @param {String} address
 * @return {Boolean}
 */
proto.checkValid = function* (address) {
  const isValid = keypair.checkAddress(address);
  return this._responseData({
    isValid,
  });
};

/**
 * Get account information
 * @param  {String} address
 * @return {Object}
 */
proto.getInfo = function* (address) {
  if (!keypair.checkAddress(address)) {
    return this._responseError(errors.INVALID_ADDRESS_ERROR);
  }

  const res = yield this._request('get', 'getAccount', { address });

  if (res.error_code !== 0) {
    return this._responseError(errors.ACCOUNT_NOT_EXIST);
  }

  let nonce =  res.result.nonce;

  nonce = nonce ? nonce : '0';

  return this._responseData({
    address: res.result.address,
    balance: res.result.balance,
    nonce: nonce,
    assets: res.result.assets || [],
    priv: res.result.priv || {},
  });
};

/**
 * Get account balance
 * @param  {String} address
 * @return {Object}
 */
proto.getBalance = function* (address) {
  if (!keypair.checkAddress(address)) {
    throw new Error('Invalid address');
  }

  let info = yield this.getInfo(address);

  if (info.errorCode === 0) {
    return this._responseData({
      balance: info.result.balance,
    });
  }

  return this._responseError(errors.ACCOUNT_NOT_EXIST);
};

/**
 * Get nonce
 * @param  {String} address
 * @return {Object}
 */
proto.getNonce = function* (address) {
  if (!keypair.checkAddress(address)) {
    return this._responseError(errors.INVALID_ADDRESS_ERROR);
  }

  let info = yield this.getInfo(address);

  if (info.errorCode === 0) {
    return this._responseData({
      nonce: info.result.nonce,
    });
  }

  return this._responseError(errors.ACCOUNT_NOT_EXIST);
};

proto.getAssets = function* (address) {
  if (!keypair.checkAddress(address)) {
    return this._responseError(errors.INVALID_ADDRESS_ERROR);
  }

  let info = yield this.getInfo(address);

  if (info.errorCode === 0) {
    return this._responseData({
      assets: info.result.assets,
    });
  }

  return this._responseError(errors.ACCOUNT_NOT_EXIST);
};

wrap(proto);