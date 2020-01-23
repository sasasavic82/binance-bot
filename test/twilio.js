const assert = require('assert');
const twilio = require('../modules/twilio.js');

const shouldTestTwilio = process.env.TWILIO_ENABLED === 'true' || process.env.TWILIO_ENABLED === 'TRUE';

shouldTestTwilio && describe('Twilio', function() {
    this.timeout(30000);
    it('should be able to text user', (done) => {
        (async() => {
            try {
                assert.equal(await twilio.sendText('Get ready to trade homeboy, TradeBot is Online!  Make that mo-mo-money!'), 'text was not sent');
                done();
            } catch(err) {
                done(false);
            }
        })();
    });
});