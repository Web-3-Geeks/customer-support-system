// The highest page number a list accepts. With the largest page size this is already far more than any real list
// holds, and it keeps absurd values from ever reaching the database.
const MAX_PAGE = 10000;

module.exports = { MAX_PAGE };
