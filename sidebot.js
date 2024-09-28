import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'
import cron from 'node-cron'
import { Worker } from 'worker_threads'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
console.log(await client.ping())


class Trend {
    constructor(asset, quote, time){
        this.asset = asset
        this.quote = quote
        this.trades = []
        this.last = {
            high: 0,
            low: 0
        }
        this.time = time
        this.keep = false
        this.price = 0
        this.low = 1e10
        this.high = 0
        this.mark = new Map()
        this.worker = new Worker('./sidetrade.js')
        this.getPrice()
    }

    getPrice(){
        client.ws.trades([this.asset + this.quote], msg => {
            this.price = parseFloat(msg.price)
            // create candlestick
            if(this.high < this.price) { 
                this.high = this.price
            }
            if(this.low > this.price){
                this.low = this.price
            }
            // if trend stop trade
            if(this.high > this.last.high && this.low > this.last.low && this.last.trend == 'up'){
                this.keep = true
                this.worker.postMessage({ type: 'CANCEL', price: this.price, last: {...this.last}, id: 0, time: msg.eventTime})
            }
            if(this.low < this.last.low && this.high < this.last.high && this.last.trend == 'down'){
                this.keep = true
                this.worker.postMessage({ type: 'CANCEL', price: this.price, last: {...this.last}, id: 0, time: msg.eventTime})
            }
            //post price to worker
            this.worker.postMessage({ type: 'PRICE', price: this.price, last: {...this.last}, id: 0, time: msg.eventTime})
        })
    }

    filter(candle){
        if (this.last.high >= candle.high && this.last.low <= candle.low) {
            if(this.last.trend == 'down'){
                this.last = {...candle}
                this.last.trend = 'down';
                this.trades.push({type: 'BUY', price: this.price, last: {...this.last} });
                this.worker.postMessage({type: 'BUY', price: this.price, last: {...this.last}, id: 10, time: Date.now() })
                console.log('inbounce down')
                this.keep = false
            }
            if(this.last.trend == 'up'){
                this.last = {...candle}
                this.last.trend = 'up';
                this.trades.push({type: 'SELL', price: this.price, last: {...this.last} });
                this.worker.postMessage({type: 'SELL', price: this.price, last: {...this.last}, id: 10, time: Date.now() })
                console.log('inbounce up')
                this.keep = false
            }
        }
        if (this.last.high < candle.high && this.last.low > candle.low) {
    
            if (this.last.trend == 'up') {
                this.last = {...candle}
                this.last.trend = this.keep? 'up': 'down'
                if(this.last.trend == 'up'){
                    console.log('outbounce up');
                    this.trades.push({type: 'SELL', price: this.price, last: {...this.last}})
                    this.worker.postMessage({type: 'SELL', price: this.price, last: {...this.last}, id: 21, time: Date.now() })
                } else {
                    console.log('outbounce down');
                    this.trades.push({type: 'BUY', price: this.price, last: {...this.last} });
                    this.worker.postMessage({type: 'BUY', price: this.price, last: {...this.last}, id: 22, time: Date.now() })
                }
            } else {
                this.last = {...candle}
                this.last.trend = this.keep? 'down': 'up'

                if(this.last.trend == 'down'){
                    console.log('outbounce down');
                    this.trades.push({type: 'BUY', price: this.price, last: {...this.last} });
                    this.worker.postMessage({type: 'BUY', price: this.price, last: {...this.last}, id: 23, time: Date.now() })
                } else {
                    console.log('outbounce up');
                    this.trades.push({type: 'SELL', price: this.price, last: {...this.last} });
                    this.worker.postMessage({type: 'SELL', price: this.price, last: {...this.last}, id: 24, time: Date.now() })

                }
            }
            this.keep = false
        }
    
        if (this.last.high < candle.high && this.last.low <= candle.low) {
            this.last = {...candle}
            this.last.trend = 'up';
            this.trades.push({type: 'SELL', price: this.price, last: {...this.last} });
            this.worker.postMessage({type: 'SELL', price: this.price, last: {...this.last}, id: 30, time: Date.now()})
            console.log('trend up')
            this.keep = false
        }
    
        if (this.last.high >= candle.high && this.last.low > candle.low) {
            this.last = {...candle}
            this.last.trend = 'down';
            this.trades.push({type: 'BUY', price: this.price, last: {...this.last}})
            this.worker.postMessage({type: 'BUY', price: this.price, last: {...this.last}, id: 31, time: Date.now()})
            console.log('trend down')
            this.keep = false
        }
    }
    run(){
        console.log('start cron job')
        setInterval(() => {
            const now = new Date()
            const minutes = now.getMinutes()
            const seconds = now.getSeconds()
            if(minutes%this.time === 0) {
                if(seconds === 0){
                    let candle = {
                        low: this.low,
                        high: this.high
                    }
                    this.low = 1e10
                    this.high = 0
                    console.log('-------------')
                    this.filter(candle)
                    console.log(candle ,this.trades.slice(-5))
                }
            }
        }, 1000);
    }
}

const trend = new Trend('SOL', 'FDUSD', 1)
trend.run()