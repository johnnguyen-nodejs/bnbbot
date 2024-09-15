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
    constructor(symbol, time){
        this.symbol = symbol
        this.cooks = []
        this.trades = []
        this.last = {
            high: 0,
            low: 0
        }
        this.time = time
        this.price = 0
        this.low = 1e10
        this.high = 0
        this.mark = new Map()
        this.worker = new Worker('./trendtrade.js')
        this.getPrice()
    }

    getPrice(){
        client.ws.trades([this.symbol], msg => {
            this.price = parseFloat(msg.price)
            if(this.high < this.price) {
                this.high = this.price
            }
            if(this.low > this.price){
                this.low = this.price
            }
            if(this.price > this.last.high && this.last.trend == 'up'){
                this.worker.postMessage({ type: 'CANCEL', price: this.price, id: 0})
            }
            if(this.price < this.last.low && this.last.trend == 'down'){
                this.worker.postMessage({ type: 'CANCEL', price: this.price, id: 0})
            }
            this.worker.postMessage({ type: 'PRICE', price: this.price, id: 0})
        })
    }

    filter(candle){
        if (this.last.high > candle.high && this.last.low < candle.low) {
            if(this.last.trend == 'down'){
                this.trades.push({id: 3, type: 'BUY', price: this.last.high });
                this.worker.postMessage({id: 3, type: 'BUY', price: this.last.high })
            }
            if(this.last.trend == 'up'){
                this.trades.push({id: 2, type: 'SELL', price: this.last.low });
                this.worker.postMessage({id: 2, type: 'SELL', price: this.last.low })
            }
        }
        if (this.last.high < candle.high && this.last.low > candle.low) {
            let ct = this.cooks.length - 1;
            for (let j = this.cooks.length - 1; j >= 0; j--) {
                if (this.cooks[j].high < candle.high && this.cooks[j].low > candle.low) {
                    ct = j;
                } else {
                    break;
                }
            }
            this.cooks = this.cooks.slice(0, ct);
            this.last = this.cooks[this.cooks.length - 1];
    
            if (this.last) {
                if (this.last.high < candle.high && this.last.low < candle.low) {
                    console.log('up1');
                    this.last = {...candle}
                    this.last.trend = 'up';
                    this.cooks.push(this.last);
                    this.trades.push({id: 1, type: 'SELL', price: this.last.low})
                    this.worker.postMessage({id: 2, type: 'SELL', price: this.last.low })
                }
            
                if (this.last.high > candle.high && this.last.low > candle.low) {
                    console.log('down1');
                    this.last = {...candle}
                    this.last.trend = 'down';
                    this.cooks.push(this.last);
                    this.trades.push({id: 1, type: 'BUY', price: this.last.high });
                    this.worker.postMessage({id: 2, type: 'BUY', price: this.last.high })
                }
            } else {
                this.last = {...candle}
                this.last.trend = 'up';
                this.cooks.push(this.last)
            }
        }
    
        if (this.last.high < candle.high && this.last.low < candle.low) {
            console.log('up');
            this.last = {...candle}
            this.last.trend = 'up';
            this.cooks.push(this.last)
            this.trades.push({id: 2, type: 'SELL', price: this.last.low });
            this.worker.postMessage({id: 2, type: 'SELL', price: this.last.low})
        }
    
        if (this.last.high > candle.high && this.last.low > candle.low) {
            console.log('down');
            this.last = {...candle}
            this.last.trend = 'down';
            this.cooks.push(this.last);
            this.trades.push({id: 3, type: 'BUY', price: this.last.high})
            this.worker.postMessage({id: 3, type: 'BUY', price: this.last.high})
        }
    }
    run(){
        console.log('start cron job')
        setInterval(() => {
            const now = new Date()
            const minutes = now.getMinutes()
            const seconds = now.getSeconds()
            if(this.time.includes(minutes) && seconds == 0) {
                let candle = {
                    low: this.low,
                    high: this.high
                }
                this.low = 1e10
                this.high = 0
                this.filter(candle)
                console.log(candle, this.last ,this.cooks,this.trades)
            }
            if(this.time.includes(minutes) && seconds == 59) {
                this.worker.postMessage({ type: 'CANCEL', price: this.price, id: 0})
            }
        }, 1000);
    }
}

const trend = new Trend('BTCFDUSD', [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59])
trend.run()