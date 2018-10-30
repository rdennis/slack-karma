module.exports = function (flags, req, res) {
    res.send(`users: ${flags.join(', ')}`);
};