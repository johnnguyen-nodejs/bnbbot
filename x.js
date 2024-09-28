import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import Binance from 'binance-api-node'


const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEYN,
    apiSecret: process.env.BINANCE_API_SECRETN
})
console.log(await client.ping())
const symbol = process.env.SYMBOL || 'BTCFDUSD'
let k = 0
let line = 0
let price = 0
let n = 0
let t = 0
let min = 1000
let max = 0
let f = 0

const main = async () => {
    try {
        client.ws.trades([symbol], async trade => {

            if(line == 0) {
                line = parseFloat(trade.price)
            } else {
                if((line <= price && line >= parseFloat(trade.price)) || (line >= price && line <= parseFloat(trade.price))){
                    k++
                    if(k > max){
                        max = k
                    }
                    if(k < min){
                        min = k
                    }
                }
            }
            
            price = parseFloat(trade.price)
        })
        setInterval(() => {
            n++
            if(n >=1){
                t += k
            }
            if(k <= 4) {
                f++
            }
            console.log(k, max, min, t/n, f/n)
            k = 0
            line = price - 2
        }, 10000);
    } catch (error) {
        console.log(error)
    }
}

main()
