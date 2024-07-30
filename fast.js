import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import cron from 'node-cron'
import Binance from 'binance-api-node'
import { setTimeout } from 'node:timers/promises'
import { redis } from  './lib.js'
import crypto from 'crypto'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
})

const cancelOrder = async (symbol, orderId) => {
    try {
        const getOrder = await client.futuresOpenOrders({
            symbol
        })
        if((getOrder.filter(item => item.orderId == orderId)).length == 0) return 'No order'
        const order = await client.futuresCancelOrder({
            symbol,
            orderId
        })
        return order.orderId
    } catch (error) {
        throw new Error(error)
    }
}


const getBalance = async (unit) => {
    try {
        const accountInfo = await client.accountInfo();
        const usdtBalance = accountInfo.balances.find(asset => asset.asset === unit).free;
        return parseFloat(usdtBalance);
    } catch (error) {
        throw new Error(error)
    }
};
const placeLimitOrder = async (symbol, side, quantity, price) => {
    try {
        const order = await client.order({
            symbol,
            side,
            type: 'LIMIT',
            quantity,
            price
        });
        return order;
    } catch (error) {
        console.log(error)
        throw new Error(error)
    }
};
const getOrderBookPrice = async (symbol) => {
    try {
        const books = await client.book({symbol})
        return {
            bid: books?.bids[0]?.price || 0,
            ask: books?.asks[0]?.price || 0
        }
    } catch (error) {
        throw new Error(error)
    }
}

const placeStopLossOrder = async (symbol, side, quantity, price, stopPrice) => {
    try {
        await client.order({
            symbol,
            side,
            type: 'STOP_LOSS_LIMIT',
            quantity,
            price,
            stopPrice
        })
    } catch (error) {
        throw new Error(error)
    }
}

const buyFunc = async (symbol) => {
    try {
        await client.ws.user(async msg => {
            console.log(msg)
            if(msg?.price) {
                console.log((symbol, 'SELL', Number(msg.quantity).fix(5), (Number(msg.price) - 3).fix(2), (Number(msg.price)-2.01).fix(2)))
                await placeStopLossOrder(symbol, 'SELL', Number(msg.quantity).fix(5), (Number(msg.price) - 3).fix(2), (Number(msg.price)-2.01).fix(2))

            }
        })
        const balance = await getBalance('FDUSD')

        const {bid, ask} = await getOrderBookPrice('BTCFDUSD')
        console.log(bid)
        await placeLimitOrder(symbol, 'BUY', (10/(Number(bid) - 2)).fix(5), (Number(bid) - 2).fix(2))
        
        return true
    } catch (error) {
        console.log(error)
    }
}


buyFunc('BTCFDUSD')