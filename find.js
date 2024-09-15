import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEY1,
    apiSecret: process.env.BINANCE_API_SECRET1
})
console.log(await client.ping())
const symbol = process.env.SYMBOL || 'BTCFDUSD'


// main()
class Trade {
    constructor(cap, symbol) {
        this.symbol = symbol
        this.start = 0
        this.buy = true
        this.usd = cap
        this.btc = 0
    }

    random(n){
        return Math.floor(Math.random()*n)
    }
    run(){
        client.ws.trades([symbol], async trade => {
            const p = parseFloat(trade.price)
            if(p + 2 < this.start) {
                if(this.buy) {
                    const rand = this.random(4)
                    if(rand == 0){
                        this.buy = false
                        this.btc = (this.usd/p).fix(5)
                        this.usd -= this.btc*p
                        console.log('--BUY--', this.usd + this.btc*p, this.btc*p, this.btc, p)
                    } else {
                        console.log('BUY ERROR', p)
                    }
                }

            }
            if(p > this.start + 2) {
                if(!this.buy) {
                    const rand = this.random(4)
                    if(rand == 0){
                        this.buy = true
                        this.usd += p*this.btc
                        console.log('--SELL--', this.usd, this.btc*p, this.btc, p)
                    } else {
                        console.log('SELL ERROR', p)
                    }
                }
            }

            this.start = p
        })
    }


}

const trade = new Trade(12, symbol)

trade.run()


