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

class Trade {
    constructor(symbol, r, r1) {
        this.symbol = symbol
        this.btcA = 0
        this.usdA = 0
        this.btcL = 0
        this.usdL = 0
        this.price = 0
        this.r = r
        this.r1 = r1
        this.bWorker = new Worker('./timebuy.js')
        this.sWorker = new Worker('./timesell.js')
        this.balance()
        this.updateBalance()
        this.prices()
    }

    async balance() {
        const accountInfo = await client.marginAccountInfo();
        this.usdA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD')?.free)
        this.btcA = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC')?.free)
        this.usdL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'FDUSD')?.locked)
        this.btcL = parseFloat(accountInfo.userAssets.find(asset => asset.asset === 'BTC')?.locked)
        console.log(this.usdA, this.btcA)
    }

    updateBalance() {
        client.ws.marginUser(msg => {
            if(msg.eventType == 'outboundAccountPosition') {
                this.btcA = parseFloat(msg.balances[0]?.free)
                this.usdA = parseFloat(msg.balances[2]?.free)
                this.btcL = parseFloat(msg.balances[0]?.locked)
                this.usdL = parseFloat(msg.balances[2]?.locked)
            }
        })
    }

    prices(){
        client.ws.trades([this.symbol], msg => {
            this.price = parseFloat(msg.price)
            this.sWorker.postMessage({ a: 0, p: this.price })
        })
    }

    open(){
        if(this.usdA > 5){
            this.bWorker.postMessage({ a: this.usdA/(this.price*this.r), p: this.price*this.r})
        }
    }

    open1(){
        if(this.usdA > 5){
            this.bWorker.postMessage({ a: this.usdA/(this.price*this.r1), p: this.price*this.r1})
        }
    }

    stop(){
        this.bWorker.postMessage({ a: 0, p: 0 })
    }

    close(){
        if(this.btcA > 0.0001){
            this.sWorker.postMessage({ a: this.btcA, p: this.price })
        }
    }

    run(){
        console.log('start cron job')
        // cron.schedule('0 * * * * *', this.open, {
        //     scheduled: true,
        //     timezone: 'Etc/GMT'
        // });
        // cron.schedule('0 1,2,3,4,5,6,7,8,9,10,11,14,15,17,18,19,20,23 * * *', this.open1, {
        //     scheduled: true,
        //     timezone: 'Etc/GMT'
        // });
        // cron.schedule('59 * * * *', this.stop, {
        //     scheduled: true,
        //     timezone: 'Etc/GMT'
        // });
        // cron.schedule('55 59 * * * *', this.close, {
        //     scheduled: true,
        //     timezone: 'Etc/GMT'
        // });
        setInterval(() => {
            const now = new Date()
            const hours = now.getHours()
            const minutes = now.getMinutes()
            const seconds = now.getSeconds()
            if([4,5,7,19,20,23].includes(hours) && minutes == 0 && seconds == 0) {
                this.open()
            }
            if(![4,5,7,19,20,23].includes(hours) && minutes == 0 && seconds == 0) {
                this.open1()
            }
            if(minutes == 59 && seconds == 0) {
                this.stop()
            }
            if(minutes == 59 && seconds == 50) {
                this.close()
            }
        }, 1000);
    }
    
}

const trade = new Trade('BTCFDUSD', 0.996, 0.98)

trade.run()