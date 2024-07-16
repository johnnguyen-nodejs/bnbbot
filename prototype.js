Array.prototype.C = function(index) {
    return this[this.length - 1 - index];
};

Array.prototype.now = function () {
    return this.length - 1;
};

Number.prototype.len = function () {
    return this.toString().length;
};

Number.prototype.sh = function () {
    return Number(this.toFixed(2));
};

Number.prototype.time = function () {
    var date = new Date(this * 1000).toISOString();
    return date.replace('T', ' ').slice(0, 19);
};

Array.prototype.V = function(index) {
    return this[this.length - 1 - index];
};

Array.prototype.ln = function() {
    return this.length - 1;
};

Number.prototype.sh = function () {
    return Number(this.toFixed(2));
};

Number.prototype.fix = function (d) {
    const [interger, decimal] = this.toString().split('.')
    return Number(`${interger}.${decimal.slice(0, d)}`);
}