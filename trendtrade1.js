import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import { parentPort } from 'worker_threads'
import { db1, db2, db3 } from './db.js'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})

class Buy {
    constructor(asset, quote, aLimit, qLimit, cap) {
        this.asset = asset
        this.quote = quote
        this.aLimit = aLimit
        this.qLimit = qLimit
        this.id = 0
        this.cap = cap
        this.capU = 0
        this.capB = 0
        this.capV = 0
        this.db = db1
        this.faileDb = db2
        this.candles = db3
        this.oNew = new Map()
        this.older = []
        this.k = 0
        this.last = {
            high: 0,
            low: 0,
            trend: 'down'
        }
        this.e = 0
        this.e1 = 0
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
            if(order) this.e = 0
            return order;
        } catch (error) {
            console.log(side, error.message)
            this.e++
            if(this.e < 15){
                this.order(quantity, price, stopPrice,side)
            }
        }
    }

    async order2(quantity, price, side) {
        try {
            const order = await client.marginOrder({
                symbol: this.asset + this.quote,
                side,
                type: 'LIMIT_MAKER',
                quantity,
                price
            })
            if(order){
                this.e1 = 0
            }
            return order;
        } catch (error) {
            console.log(side, error.message)
            this.e1++
            if(this.e1 < 15){
                this.order2(quantity, this.price.toFixed(this.qLimit),side)
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

    cancelAll0(){
        for(let id of this.oNew.keys()){
            this.cancel(id)
        }
    }


    cancelAll1(){
        for(let id of this.older){
            this.cancel(id)
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
                    this.k++
                    console.log('filled: ', msg.orderId)
                    this.db.put(msg.eventTime, {
                        usdA: this.usdA,
                        usdB: this.usdB,
                        btcA: this.btcA,
                        btcB: this.btcB,
                        cap: this.cap,
                        capU: this.capU,
                        capB: this.capB,
                        id: this.id,
                        time: msg.eventTime,
                        symbol: msg.symbol,
                        side: msg.side,
                        price: Number(msg.price),
                        amount: Number(msg.quantity),
                        stt: 'filled'
                    })
                    
                }
                if(msg.orderStatus == 'CANCELED'){
                    if(Number(msg.totalTradeQuantity) > 0){
                        this.k++
                        // if((Number(msg.quantity) -Number(msg.totalTradeQuantity))*this.price > 6){
                        //     this.order2((Number(msg.quantity) -Number(msg.totalTradeQuantity)).fix(this.aLimit), this.price.toFixed(this.qLimit), msg.side)
                        // }
                    }
                    this.db.put(msg.eventTime, {
                        usdA: this.usdA,
                        usdB: this.usdB,
                        btcA: this.btcA,
                        btcB: this.btcB,
                        cap: this.cap,
                        capU: this.capU,
                        capB: this.capB,
                        id: this.id,
                        time: msg.eventTime,
                        symbol: msg.symbol,
                        side: msg.side,
                        price: Number(msg.price),
                        amount: Number(msg.quantity) - Number(msg.totalTradeQuantity),
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
                this.candles.put(Date.now(), {...this.last, id: this.id})
                this.k = 0
                if(this.cap*2 < this.usdA){
                    this.order((this.cap/last.high + this.capV).fix(this.aLimit), (last.high + 0.01).toFixed(this.qLimit), (last.high).toFixed(this.qLimit), type)
                }
                this.capU = this.cap  - (this.cap/last.high).fix(this.aLimit)*last.high
                this.capB = (this.cap/last.high).fix(this.aLimit)
                console.log(this.usdA, this.usdL, this.btcA, this.btcL, this.cap, this.capU, this.capB, this.capV)
                console.log('buy order', (this.cap/last.high + this.capV).fix(this.aLimit))
            }
            if(type == 'SELL'){
                this.last = {...last}
                this.id = id
                this.candles.put(Date.now(), {...this.last, id: this.id})
                this.k = 0
                if(this.capB == 0){
                    this.capB = this.cap/this.price
                }
                if(this.capB*2 < this.btcA){
                    this.order((this.capB*2).fix(this.aLimit), (last.low - 0.01).toFixed(this.qLimit), (last.low + 0.02).toFixed(this.qLimit), type)
                }
                this.cap = this.capU + this.capB*last.low
                this.capV = this.capB
                console.log(this.usdA, this.usdL, this.btcA, this.btcL, this.cap, this.capU, this.capB, this.capV)
                console.log('sell order', this.capB*2)
            }
            if(type == 'PRICE'){
                this.price = price
            }
            if(type == 'CANCEL'){
                if(id == 0){
                    this.cancelAll0()
                } else {
                    this.cancelAll1()
                }
            }
            if(type == 'UPDATE'){
                this.older.length = 0
                for(let id of this.oNew.keys()){
                    this.older.push(id)
                }
                console.log(this.older)
            }

            if(type == 'REVERSE'){
                console.log(last, id, this.usdA, this.btcA, this.usdL, this.btcL)
                if(id == 51 && ((this.k == 0 && this.oNew.size == 0)||(this.oNew.size == 1))){
                    console.log('OHHO SELL FAILED')
                    this.cancelAll0()
                    this.order2((this.capB*2).fix(this.aLimit), this.price.toFixed(this.qLimit), 'SELL')
                    this.faileDb.put(Date.now(), {
                        usdA: this.usdA,
                        usdL: this.usdL,
                        usdB: this.usdB,
                        btcA: this.btcA,
                        btcL: this.btcL,
                        btcB: this.btcB,
                        id: this.id,
                        time: Date.now(),
                        symbol: this.asset + this.quote,
                        side: 'SELL',
                        price: Number((last.low + 0.01).toFixed(this.qLimit)),
                        amount: (this.btcA*2).fix(this.aLimit),
                        stt: 'failed'
                    })
                }
                if(id == 52 && ((this.k == 0 && this.oNew.size == 0)||(this.oNew.size == 1))){
                    console.log('OHHO BUY FAILED')
                    this.cancelAll0()
                    this.order2((this.cap/last.high + this.capV).fix(this.aLimit), this.price.toFixed(this.qLimit), 'BUY')
                    this.faileDb.put(Date.now(), {
                        usdA: this.usdA,
                        usdL: this.usdL,
                        usdB: this.usdB,
                        btcA: this.btcA,
                        btcL: this.btcL,
                        btcB: this.btcB,
                        id: this.id,
                        time: Date.now(),
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

const buy = new Buy('BTC','FDUSD',5,2, 15)

buy.run()




