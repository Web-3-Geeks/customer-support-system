const AppError = require("../utils/AppError");

const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse({
        body: req.body ?? {},
        params: req.params,
        query: req.query,
    });

    if (!result.success) {
        const message = result.error.issues
         .map((issue) => `${issue.path.slice(1).join(".")}: ${issue.message}`)
         .join(", ");
        return next(new AppError(message, 400));
    }

    if (result.data.body) req.body = result.data.body;
    next();
};

module.exports = validate;