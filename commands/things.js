module.exports = function (flags, req, res) {
    res.send(`things: ${flags.join(', ')}`);
};