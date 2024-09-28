import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
import { db1, db2 } from './db.js'
import Queue from 'bull'
const myQueue = new Queue('trade', {
    redis: { host: '127.0.0.1', port: 6379 }
})
const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})

class Buy {
    constructor(asset, quote, aLimit, qLimit) {
        this.asset = asset
        this.quote = quote
        this.aLimit = aLimit
        this.qLimit = qLimit
        this.id = 0
        this.trades = db1
        this.candles = db2
        this.oNew = new Map()
        this.last = {
            high: 0,
            low: 0,
            trend: 'down'
        }
        this.price = 0
        this.btcA = 0
        this.btcL = 0
        this.usdA = 0
        this.usdL = 0
        this.usdB = 0
        this.btcB = 0
        this.stop = false
        this.cancelAll()
        this.event()
    }
    
    async order(quantity, price, side) {
        try {
            const order = await client.marginOrder({
                symbol: this.asset + this.quote,
                side,
                type: 'LIMIT_MAKER',
                quantity,
                price
            })
            return order;
        } catch (error) {
            if(error.message != `Mandatory parameter 'quantity' was not sent, was empty/null, or malformed.`){
                this.order(quantity, this.price.toFixed(2), side)
            }
        }
    }
    async cancel(orderId) {
        try {
            await client.marginCancelOrder({
                symbol: this.asset + this.quote,
                orderId
            })
        } catch (error) {
            console.log('-')
        }
    }

    cancelAll(){
        setInterval(() => {
            for(let id of this.oNew.keys()){
                this.cancel(id)
            }
        }, 50);
    }

    async loan(asset, amount) {
        try {
          const loanResponse = await client.marginLoan({
            asset: asset,
            amount: amount,
          });
          console.log('Loan: ', loanResponse);
        } catch (error) {
          console.error('Loan Error: ', error.message);
        }
      }


    async balance(){
        try {
            const accountInfo = await client.marginAccountInfo();
            this.usdA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === this.quote)?.free)
            this.btcA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === this.asset)?.free)
            this.usdL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === this.quote)?.locked)
            this.btcL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === this.asset)?.locked)
            this.usdB = parseFloat(accountInfo.userAssets.find(asset => asset.asset === this.quote)?.borrowed)
            this.btcB = parseFloat(accountInfo.userAssets.find(asset => asset.asset === this.asset)?.borrowed)
        } catch (error) {
            console.log('-')
        }
    }

    async event() {
        await this.balance()
        client.ws.marginUser( msg => {
            if(msg.eventType == 'outboundAccountPosition') {
                if(msg.balances.find(asset => asset.asset === this.asset)){
                    this.btcA = parseFloat(msg.balances.find(asset => asset.asset === this.asset)?.free)
                    this.btcL = parseFloat(msg.balances.find(asset => asset.asset === this.asset)?.locked)
                }
                if(msg.balances.find(asset => asset.asset === this.quote)){
                    this.usdA = parseFloat(msg.balances.find(asset => asset.asset === this.quote)?.free)
                    this.usdL = parseFloat(msg.balances.find(asset => asset.asset === this.quote)?.locked)
                }
            }
            if(msg.eventType == 'executionReport' && msg.orderType == "LIMIT_MAKER") {
                if(msg.orderStatus == 'NEW') {
                    if(!this.oNew.get(msg.orderId)){
                        this.oNew.set(msg.orderId, true)
                        console.log('new order: ', msg.orderId)
                    }
                }
                if(msg.orderStatus == 'FILLED') {
                    this.oNew.delete(msg.orderId)
                    console.log('filled: ', msg.orderId)
                    if(msg.side == 'BUY'){
                        this.trades.put(msg.eventTime, {
                            usdA: this.usdA,
                            btcA: this.btcA,
                            id: this.id,
                            time: msg.eventTime,
                            symbol: msg.symbol,
                            side: msg.side,
                            fPrice: this.last.high,
                            rPrice: Number(msg.price),
                            amount: Number(msg.quantity),
                            stt: 'filled'
                        })
                    } else {
                        this.trades.put(msg.eventTime, {
                            usdA: this.usdA,
                            btcA: this.btcA,
                            id: this.id,
                            time: msg.eventTime,
                            symbol: msg.symbol,
                            side: msg.side,
                            fPrice: this.last.low,
                            rPrice: Number(msg.price),
                            amount: Number(msg.quantity),
                            stt: 'filled'
                        })
                    }
                    
                }
                if(msg.orderStatus == 'CANCELED'){
                    this.oNew.delete(msg.orderId)
                    if((Number(msg.quantity) - Number(msg.totalTradeQuantity))*this.price > 6){
                        this.order((Number(msg.quantity) - Number(msg.totalTradeQuantity)).fix(this.aLimit), this.price.toFixed(this.qLimit), msg.side)
                    }
                }
            }
        })
    }

    run(){
        parentPort.on('message', async (message) => {
            const { type, price, last, id, time} = message
            if(type == 'BUY') {
                this.stop = false
                this.last = {...last}
                this.id = id
                this.candles.put(Date.now(), {...this.last, id: this.id})
            }
            if(type == 'SELL'){
                this.stop = false
                this.last = {...last}
                this.id = id
                this.candles.put(Date.now(), {...this.last, id: this.id})
            }
            if(type == 'PRICE'){
                this.price = price
                if(!this.stop){
                    if(this.last.trend = 'up' && this.price <= this.last.low - 0.01 && this.last.low > 0){
                        this.stop = true
                        myQueue.add({
                            a: ((this.btcA - this.btcB)*2).fix(this.aLimit),
                            p: this.price.toFixed(this.qLimit),
                            side: 'SELL',
                            time
                        })
                        this.order(((this.btcA - this.btcB)*2).fix(this.aLimit), this.price.toFixed(this.qLimit), 'SELL')
                    }
                    if(this.last.trend = 'down' && this.price >= this.last.high + 0.01 && this.last.high > 0){
                        this.stop = true
                        myQueue.add({
                            a: (this.usdA/this.price).fix(this.aLimit),
                            p: this.price.toFixed(this.qLimit),
                            side: 'BUY',
                            time
                        })
                        this.order((this.usdA/this.price).fix(this.aLimit), this.price.toFixed(this.qLimit), 'BUY')
                    }
                }
            }
            if(type == 'CANCEL'){
                this.stop = true
            }
        })
        myQueue.process(1, async job => {
            const { a, p, side, time } = job.data
            if(!this.mark.has(Math.floor(time/60000)*60000)){
                this.mark.set(Math.floor(time/60000)*60000, true)
                console.log('order', side, time)
                this.order(a, p, side)
            }
        })
    }
}

const buy = new Buy('SOL','FDUSD',3,2)

buy.run()




