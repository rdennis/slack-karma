module.exports = {
    getEnvVal: (key, defaultVal) => {
        let value = process.env[key];

        if (typeof value === 'undefined') {
            value = defaultVal;
        }

        return value;
    }
};