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
        this.cooks = []
        this.trades = []
        this.trend = 'up'
        this.last = {
            high: 0,
            low: 0
        }
        this.time = time
        this.price = 0
        this.low = 1e10
        this.high = 0
        this.worker = new Worker('./godtrade.js')
        this.getPrice()
    }

    getPrice(){
        client.ws.trades([this.asset+this.quote], msg => {
            this.price = parseFloat(msg.price)
            if(this.high < this.price) { 
                this.high = this.price
            }
            if(this.low > this.price){
                this.low = this.price
            }
            this.worker.postMessage({ type: 'PRICE', price: this.price})
        })
    }

    filter(candle){
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
                    if(this.trend == 'down'){
                        this.trades.push({type: 'BUY', price: this.price})
                        this.worker.postMessage({type: 'BUY', price: this.price})

                    }
                    this.trend = 'up'
                }
            
                if (this.last.high > candle.high && this.last.low > candle.low) {
                    console.log('down1');
                    this.last = {...candle}
                    this.last.trend = 'down';
                    this.cooks.push(this.last);
                    if(this.trend == 'up'){
                        this.trades.push({type: 'SELL', price: this.price });
                        this.worker.postMessage({type: 'SELL', price: this.price })
                    }
                    this.trend = 'down'
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
            if(this.trend == 'down'){
                this.trades.push({type: 'BUY', price: this.price });
                this.worker.postMessage({type: 'BUY', price: this.price })
            }
            this.trend = 'up'
        }
    
        if (this.last.high > candle.high && this.last.low > candle.low) {
            console.log('down');
            this.last = {...candle}
            this.last.trend = 'down';
            this.cooks.push(this.last);
            if(this.trend == 'up'){
                this.trades.push({type: 'SELL', price: this.price})
                this.worker.postMessage({type: 'SELL', price: this.price})
            }
            this.trend = 'down'
        }
    }
    run(){
        console.log('start cron job')
        setInterval(() => {
            const now = new Date()
            const minutes = now.getMinutes()
            const seconds = now.getSeconds()
            if(minutes%this.time === 0 && seconds === 0) {
                if(seconds === 0){
                    let candle = {
                        low: this.low,
                        high: this.high
                    }
                    this.low = 1e10
                    this.high = 0
                    this.filter(candle)
                    console.log(candle, this.last ,this.cooks,this.trades)
                }
            }
        }, 1000);
    }
}

const trend = new Trend('BTC', 'FDUSD', 1)
trend.run()