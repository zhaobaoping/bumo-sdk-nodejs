'use strict';

const errors = require('../exception');

const proto = exports;

proto.assetIssueOperation = function(args) {
  try {
    const schema = {
      sourceAddress: {
        required: false,
        string: true,
        address: true,
      },
      code: {
        required: true,
        string: true,
      },
      assetAmount: {
        required: true,
        string: true,
        numeric: true,
      },
      metadata: {
        required: false,
        string: true,
        hex: true,
      }
    };

    if (!this._validate(args, schema).tag) {
      const msg = this._validate(args, schema).msg;
      return this._responseError(errors[msg]);
    }

    return {
      type: 'issueAsset',
      data: args,
    }
  } catch (err) {
    throw err;
  }
};


proto.assetSendOperation = function(args) {
  try {
    const schema = {
      sourceAddress: {
        required: false,
        string: true,
        address: true,
      },
      destAddress: {
        required: true,
        string: true,
        address: true,
      },
      code: {
        required: true,
        string: true,
      },
      issuer: {
        required: true,
        string: true,
        address: true,
      },
      assetAmount: {
        required: true,
        string: true,
        numeric: true,
      },
      metadata: {
        required: false,
        string: true,
        hex: true,
      }
    };

    if (!this._validate(args, schema).tag) {
      const msg = this._validate(args, schema).msg;
      return this._responseError(errors[msg]);
    }

    return {
      operation: {
        type: 'payAsset',
        data: args,
      },
    }
  } catch (err) {
    throw err;
  }
};