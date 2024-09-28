import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import { setTimeout } from 'timers/promises'
import { db1 } from './db.js'

const main = async () => {
    let k = 0
    let k1 = 0
    let k2 = 0
    let k3 = 0
    let k4 = 0
    let l1 = 0, l2 = 0, l3 = 0, l4  = 0
    let p = 1
    let buy = 0
    let sell = 0
    let v0 = 0
    let v1= 0
    let last = null
    let vol = 0
    let amount = 0
    for await (const [key, value] of db1.iterator()) {
        // value.time = new Date(value.time)
        // if(value.time > new Date('2024-09-17T23:41:00') && value.time < new Date('2024-09-18T09:25:00') )
        // {
            vol += value.amount*value.rPrice
            // console.log(value)
            if(k3 != 0){
                k4++
                if(k4 == 1){
                    console.log(value)
                    v0 = value.usdA + (value.btcA + value.amount - 1.5)*value.rPrice
                    amount = value.amount
                }
                if(k4 == 34){
                    console.log(value)
                    v1 = value.usdA + (value.btcA + value.amount - 1.5)*value.rPrice
                }
                if(value.side == 'BUY' && k4 > 1){
                    if(last == 'SELL'){
                        p *= k3/value.rPrice
                    }
                }
                if( value.side == 'SELL' && k4 > 1){
                    if(last == 'BUY'){
                        p *= value.rPrice/k3
                    }
                }
            }
            k3 = value.rPrice
            last = value.side
            if(value.id == 21 || value.id == 23){
                l1++
            }
            if(value.id == 22 || value.id == 24){
                l2++
            }
            if(value.id == 31 || value.id == 30){
                l3++
            }
            if(value.id == 10){
                l4++
            }
            if(value.side == 'BUY'){
                // console.log('BUY', value.rPrice - value.fPrice)
                k1++
                buy += (value.rPrice  - value.fPrice)
            } else {
                // console.log('SELL', value.fPrice - value.rPrice)
                k2++
                sell += (value.fPrice  - value.rPrice)
            }
            k++
        // }
        // await setTimeout(1000)
    }
    console.log(k , k1, buy/k1, k2, sell/k2, p,v0, v1, vol*0.00005)
}
main()


