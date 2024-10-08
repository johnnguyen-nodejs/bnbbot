import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
import { db1, db2 } from './db.js'

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
        this.db = db1
        this.faileDb = db2
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
        this.btcB = 0
        this.usdB = 0
        this.event()
    }
    
    async order(quantity, price, stopPrice, side) {
        try {
            const order = await client.marginOrder({
                symbol: this.asset + this.quote,
                side,
                type: 'STOP_LOSS_LIMIT',
                quantity,
                price,
                stopPrice
            })
            return order;
        } catch (error) {
            console.log(side, error.message)
            this.order(quantity, price, stopPrice,side)
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
                    this.usdL = parseFloat(msg.balances.find(asset => asset.asset === this.quote)?.locked)
                    this.usdA = parseFloat(msg.balances.find(asset => asset.asset === this.quote)?.free)
                }
            }
            if(msg.eventType == 'executionReport' && msg.orderType == "STOP_LOSS_LIMIT") {
                if(msg.orderStatus == 'NEW') {
                    if(!this.oNew.get(msg.orderId)){
                        this.oNew.set(msg.orderId, true)
                        console.log('new order: ', msg.orderId)
                    }
                }
                if(msg.orderStatus == 'FILLED') {
                    this.oNew.delete(msg.orderId)
                    console.log('filled: ', msg.orderId)
                    this.db.put(msg.eventTime, {
                        usdA: this.usdA,
                        usdB: this.usdB,
                        btcA: this.btcA,
                        btcB: this.btcB,
                        id: this.id,
                        time: new Date(msg.eventTime),
                        symbol: msg.symbol,
                        side: msg.side,
                        price: msg.price,
                        amount: msg.quantity,
                        stt: 'filled'
                    })
                    
                }
                if(msg.orderStatus == 'CANCELED'){
                    this.db.put(msg.eventTime, {
                        usdA: this.usdA,
                        usdB: this.usdB,
                        btcA: this.btcA,
                        btcB: this.btcB,
                        id: this.id,
                        time: new Date(msg.eventTime),
                        symbol: msg.symbol,
                        side: msg.side,
                        price: msg.price,
                        amount: msg.quantity,
                        stt: 'cancel'
                    })
                    this.oNew.delete(msg.orderId)
                    console.log('cancel success')
                }
            }
        })
    }

    run(){
        parentPort.on('message', async (message) => {
            const { type, price, last, id} = message
            if(type == 'BUY') {
                this.last = {...last}
                this.id = id
                this.candles.pus(Date.now(), {...this.last, id: this.id})
                setTimeout(() => {
                    console.log(this.usdA, this.btcA, this.usdB, this.btcB)
                    if(this.usdA > 6){
                        this.order((this.usdA/last.high).fix(this.aLimit), (last.high - 0.01).toFixed(this.qLimit), (last.high).toFixed(this.qLimit), type)
                    } else {
                        this.order(((this.btcA - this.btcB)*2).fix(this.aLimit), (last.low + 0.01).toFixed(this.qLimit), (last.low + 0.02).toFixed(this.qLimit), 'SELL')
                    }
                    console.log('buy order', this.usdA)
                }, 300);
            }
            if(type == 'SELL'){
                this.last = {...last}
                this.id = id
                this.candles.pus(Date.now(), {...this.last, id: this.id})
                setTimeout(() => {
                    console.log(this.usdA, this.btcA, this.usdB, this.btcB)
                    if((this.btcA - this.btcB)*this.price > 6){
                        this.order(((this.btcA - this.btcB)*2).fix(this.aLimit), (last.low + 0.01).toFixed(this.qLimit), (last.low + 0.02).toFixed(this.qLimit), type)
                    } else {
                        this.order((this.usdA/last.high).fix(this.aLimit), (last.high - 0.01).toFixed(this.qLimit), (last.high).toFixed(this.qLimit), 'BUY')
                    }
                    console.log('sell order', this.btcA)
                }, 300);
            }
            if(type == 'PRICE'){
                this.price = price
            }
            if(type == 'CANCEL'){
                for(let id of this.oNew.keys()){
                    this.cancel(id)
                }
            }
            if(type == 'REVERSE'){
                console.log(last, id, this.usdA, this.btcA, this.usdL, this.btcL)
                if(id == 51 && this.usdA < 6 && this.oNew.size == 0){
                    console.log('OHHO SELL FAILED')
                    this.order(((this.btcA - this.btcB)*2).fix(this.aLimit), (last.low + 0.01).toFixed(this.qLimit), (last.low + 0.02).toFixed(this.qLimit), type)
                    this.faileDb.put(Date.now(), {
                        usdA: this.usdA,
                        usdB: this.usdB,
                        btcA: this.btcA,
                        btcB: this.btcB,
                        id: this.id,
                        time: new Date(),
                        symbol: this.asset + this.quote,
                        side: 'SELL',
                        price: Number((last.low + 0.01).toFixed(this.qLimit)),
                        amount: ((this.btcA - this.btcB)*2).fix(this.aLimit),
                        stt: 'failed'
                    })
                }
                if(id == 52 && this.usdA > 6){
                    console.log('OHHO BUY FAILED')
                    this.order((this.usdA/last.high).fix(this.aLimit), (last.high - 0.01).toFixed(this.qLimit), (last.high).toFixed(this.qLimit), type)
                    this.faileDb.put(Date.now(), {
                        usdA: this.usdA,
                        usdB: this.usdB,
                        btcA: this.btcA,
                        btcB: this.btcB,
                        id: this.id,
                        time: new Date(),
                        symbol: this.asset + this.quote,
                        side: 'BUY',
                        price: Number((last.high - 0.01).toFixed(this.qLimit)),
                        amount: (this.usdA/last.high).fix(this.aLimit),
                        stt: 'failed'
                    })
                }
            }
        })
    }
}

const buy = new Buy('BTC','FDUSD',5,2)

buy.run()




