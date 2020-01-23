require('dotenv').config();
const term = require( 'terminal-kit' ).terminal;
const date = require('dateformat');
const _b = require('./modules/binance.js');
const twilio = require('./modules/twilio.js');
const binance = _b.Binance;
const orderStatus = _b.OrderStatus;

const TRADING_PAIR = process.env.TRADING_PAIR;
const PERCENTAGE = Number(process.env.PROFIT_PERCENTAGE)/100;
const HODL_COUNT = Number(process.env.HODL_COUNT);

const STARTING_ROW = 6;

const budget = (Number(process.env.BUDGET)).toFixed(8);
const fee = (budget * .001).toFixed(8);
const netBudget = budget - fee;

let unconfirmedPurchase;
let confirmingPurchase = false;
let confirmedPurchase;

let fudding = false;

let unconfirmedSell;
let confirmingSell = false;
let confirmedSell;
let fudInterval;

let master;
let webSocket;

let purchaseIncrement = 0


function position() {
    return STARTING_ROW + purchaseIncrement;
}

function setupWebSocket() {
    
    setupScreen();

    webSocket = binance.ws.partialDepth({ symbol: TRADING_PAIR, level: 5 }, (depth) => {
        const temp = {};
        temp.optimalBuyPrice = (Number(depth.bids[0].price) + 0.00000100).toFixed(8);
        temp.optimalAskPrice = (Number(depth.asks[0].price) - 0.00000100).toFixed(8);
        master = temp;
        hodl();
    });
}

function calculateQuantityBasedOnBudget(price) {
    let quantity = 0;
    while (quantity * price <= netBudget) {
        quantity += .001;
    };
    return quantity.toFixed(3);
}

async function purchase() {
    try {
        const price = master.optimalBuyPrice;
        const quantity = calculateQuantityBasedOnBudget(price);
        unconfirmedPurchase = await binance.order({ symbol: TRADING_PAIR, side: 'BUY', quantity, price });

        term.moveTo(1, position(), `^w${unconfirmedPurchase.price}^`);
        term.moveTo(45,position(), `^bPURCHASING     ^`);        

    } catch(e) {
        //console.log(e);
        return;
    }
}

async function confirmPurchase() {
    try {
        if (confirmedPurchase) return;
        confirmingPurchase = true;
        const check = await binance.getOrder({ symbol: TRADING_PAIR, orderId: unconfirmedPurchase.orderId });

        if (check.status === orderStatus.FILLED) {
            confirmingPurchase = false;
            check.price = Number(check.price).toFixed(8);
            confirmedPurchase = check;

            term.moveTo(1,position(), `^w${check.price}^`);
            term.moveTo(45,position(), `^bPURCHASED      ^`);

        };
        confirmPurchase();
    } catch(e) {
        console.log(e);
        return;
    }
}

function fud() {
    fudding = true;
    fudInterval = setInterval(() => {
        const confirmedPrice = confirmedPurchase.price;
        const currentPrice = master.optimalAskPrice;
        const profitGoalReached = (currentPrice >= confirmedPrice + (confirmedPrice * PERCENTAGE));
        if (profitGoalReached) {
            clearInterval(fudInterval);
            return sell(currentPrice);
        }
    }, 100);
}

async function sell(currentPrice) {
    try {
        const quantity = confirmedPurchase.origQty;
        unconfirmedSell = await binance.order({ symbol: TRADING_PAIR, side: 'SELL', quantity, price: currentPrice });
        //console.log('[SELLING]:::: ', unconfirmedSell.price);

        //term.moveTo(1,(STARTING_ROW + purchaseIncrement), `^w${check.price}^`);
        term.moveTo(45,position(), `^bSELLING        ^`);

        
    } catch(e) {
        console.log(e);
        return;
    }
}

async function confirmSell() {
    try {
        if (confirmedSell) return reset();
        confirmingSell = true;
        const check = unconfirmedSell && await binance.getOrder({ symbol: TRADING_PAIR, orderId: unconfirmedSell.orderId });

        if (check && check.status === orderStatus.FILLED) {
            confirmingSell = false;
            check.price = Number(check.price).toFixed(8);
            confirmedSell = check;
            let profit = (Number(check.price) - Number(confirmedPurchase.price)).toFixed(8);
            const message = 'SOLD@' + check.price + ', PROFIT:' + profit;

            term.moveTo(15,position(), `^w${check.price}^`);
            term.moveTo(30,position(), `^g${profit}^`);
            term.moveTo(45,position(), `^bSOLD           ^`);

            purchaseIncrement++;

            await twilio.sendText(message);
        };
        confirmSell();
    } catch(e) {
        console.log(e);
        return;
    }
}

async function cancelSellOrder() {
    try {
        await binance.cancelOrder({ symbol: TRADING_PAIR, orderId: unconfirmedSell.orderId });
    } catch(e) {
        console.log(e);
        return;
    }
}

function position() {
    return STARTING_ROW + purchaseIncrement;
}

function reset() {
    clearInterval(fudInterval);
    unconfirmedPurchase = null;
    confirmingPurchase = false;
    confirmedPurchase = null;
    fudding = false;
    unconfirmedSell = null;
    confirmingSell = false;
    confirmedSell = null;
    //console.log('[RESET]:::: ');
}

let hodlLogCount = 0;
function log() {
    hodlLogCount++
    if (hodlLogCount === HODL_COUNT) {
        hodlLogCount = 0;
        return reset();
    }
    const confirmedPrice = Number(confirmedPurchase.price);
    const profitMargin = Number(confirmedPrice * PERCENTAGE).toFixed(8);
    const obp = Number(master.optimalBuyPrice)

    term.moveTo(45,position(), `^bHODLING        ^`);
/*
    console.log('[HODL]:::: '
        + obp + '(current price)'
        + ' - (' + confirmedPrice + '(your price) + ' + profitMargin + '(profit margin)' + ')'
        + ' = '
        + ((Number(profitMargin) + Number(confirmedPrice)) - Number(obp)).toFixed(8)
        + ' to go!'
    );
    */
}

function setupScreen() {
    term.clear();
    term.moveTo(1,1, `^+${date(new Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT")}`);
    term.moveTo(1,3,`^rTrading^ ^#^r^w${TRADING_PAIR}^\t\t ^#^w^rBudget: ${netBudget} (Fee: ${fee})^`);
    //Purchased      Sold           Profit         Status
    term.moveTo(1,5, `^+^yBUY      ^`);
    term.moveTo(15,5, `^+^ySELL^`);
    term.moveTo(30,5, `^+^yPROFIT^`);
    term.moveTo(45,5, `^+^ySTATUS^`);
}

function hodl() {
    
    if (!master || !webSocket) return setupWebSocket();
    if (master && !unconfirmedPurchase) purchase();
    if (unconfirmedPurchase && !confirmingPurchase && !confirmedPurchase) confirmPurchase();
    if (master && !fudding && confirmedPurchase) fud();
    if (!confirmingSell && unconfirmedSell) confirmSell();
    if (master.optimalAskPrice && confirmedPurchase) log();
}

hodl();