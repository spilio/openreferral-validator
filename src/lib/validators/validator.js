import {
  Table,
  errors
} from 'tableschema';

import {
  Resources
} from './resources';

import {
  UnsupportedValidatorError,
  DataValidationError,
  ValidatorError
} from './errors';

const {TableSchemaError} = errors;


/**
 * Class used for validating
 * Open Referral resources.
 *
 * @type Validator
 */
export class Validator {


  /**
   * Constructor
   * @param  {[type]} descriptor [description]
   * @param  {[type]} basePath   [description]
   * @param  {[type]} strict     [description]
   * @param  {[type]} profile    [description]
   * @return {[type]}            [description]
   */
  constructor(resourceType) {

    // check if resource type is valid
    if (Resources.types.indexOf(resourceType) === -1) {
      throw new UnsupportedValidatorError('One of the valid resource types should provided');
    }

    this._type = resourceType;

    const resource = Resources.getDefinition(resourceType, true);

    // load the schema file that maps
    // to the requested resource type
    this._schema = resource.schema;
  }

  /**
   * Returns the schema
   * for that maps to
   * the selected resource type
   * @return {[type]} [description]
   */
  get schema() {
    return this._schema;
  }

  get type() {
    return this._type;
  }


  /**
   * Validates an input data source against
   * the resource specific schema.
   * @param  {[type]} data [description]
   * @return {[type]}      [description]
   */
  async validate(source, {
    headersRow
  }={}) {

    try {

      if (typeof source === 'undefined') {
        throw new ValidatorError('A valid data source is required');
      }

      if (typeof this.schema === 'undefined') {
        throw new ValidatorError('No schema found for validating this type of resource');
      }

      // if headers row is included,
      // start reading stream from
      // the 2nd row
      let from = 1;
      if (headersRow > 0) {
        from = 2;
      }

      const errors = [];
      await scanTable({
        source,
        schema: this._schema,
        headersRow,
        from,
        errors
      });

      // if there are errors,
      // throw an exception
      if (errors.length > 0) {
        throw new ValidatorError('Validation errors detected', errors);
      }

    } catch (e) {
      throw e;
    }
  }

}

/**
 * Scans the table and gathers
 * errors in a recursive manner.
 * @param  {[type]} source          [description]
 * @param  {[type]} schema          [description]
 * @param  {Number} [from=1]        [description]
 * @param  {Array}  [errors=[]}={}] [description]
 * @return {[type]}                 [description]
 */
async function scanTable({
  source,
  schema,
  headersRow,
  from = 1,
  errors = []
} = {}) {
  try {

    // create a new table instance
    // using the selected resource
    // schema and data source
    const table = await Table.load(source, {
      schema,
      headers: headersRow,
      trim: true,
      from
    });

    // read the table
    const data = await table.read({});
    console.log(data);

  } catch (e) {

    let line = null;

    if (e instanceof TableSchemaError) {

      line = from + e.rowNumber;

      // create a new validation error instance
      const err = new DataValidationError({
        row: line - 1,
        col: e.columnNumber,
        description: e.message
      });

      // add it to the list
      errors.push(err);

    } else if ((typeof e.errors !== 'undefined') && (e.errors.length > 0)) {

      e.errors.forEach(error => {

        line = from + error.rowNumber;

        // create a new validation error instance
        const err = new DataValidationError({
          row: line - 1,
          col: error.columnNumber,
          description: error.message
        });

        // add it to the list
        errors.push(err);
      });

    } else {

      // check if we got an error regarding
      // the end of stream
      if (e.message === 'path.startsWith is not a function') {
        return;
      }

      // otherwise throw a validation error
      const err = new ValidatorError(e.message, {
        row: e.rowNumber,
        col: e.columnNumber,
        description: e.message
      });
      throw err;
    }

    /*
     * recurse
     */

    if (!(source instanceof Array)) {

      // resume operation from the next line
      await scanTable({
        source,
        schema,
        errors,
        headersRow: -1,
        from: line
      });
    }

  }

}
