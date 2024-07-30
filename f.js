import * as dotenv from 'dotenv'
dotenv.config()
import "./prototype.js"
import cron from 'node-cron'
import Binance from 'binance-api-node'
import { setTimeout } from 'node:timers/promises'
import { redis } from  './lib.js'
import crypto from 'crypto'
import axios from 'axios'

const client = Binance.default({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
})
console.log(await client.ping())
const transformObject = (obj) => {
    let jsonString = JSON.stringify(obj);
    jsonString = jsonString.replace(/:/g, '=');
    jsonString = jsonString.replace(/,/g, '?');
    jsonString = jsonString.replace(/[{}]/g, '');

    return jsonString;
}
const symbol = 'BTCFDUSD'
const stop = 1
const limit = 1

// const createSignature = (obj) => {
//     try {
//         const timestamp = Date.now()
//         const signature = crypto.createHmac('sha256', process.env.BINANCE_API_SECRET).update(transformObject(obj)).digest('hex')
//         return {timestamp, signature}
//     } catch (error) {
//         console.log(error)
//     }
// } 

// console.log(createSignature({
//     a:2,
//     b: 3
// }))


// const getBalance = async (unit) => {
//     try {
//         const accountInfo = await client.accountInfo();
//         const balance = accountInfo.balances.find(asset => asset.asset === unit).free;
//         return parseFloat(balance);
//     } catch (error) {
//         console.log(error)
//     }
// };
const getBorrowBalance = async () => {
    try {
        const info = await client.marginIsolatedAccount({ symbols: symbol})
        const base = info.assets[0].baseAsset.free;
        const quote = info.assets[0].quoteAsset.free
        const borrow = info.assets[0].quoteAsset.borrowed
        return { base, quote, borrow }
    } catch (error) {
        console.log(error)
    }
}

const getOrderBookPrice = async () => {
    try {
        const books = await client.book({symbol})
        return {
            bid: books?.bids[0]?.price || 0,
            ask: books?.asks[0]?.price || 0
        }
    } catch (error) {
        console.log(error)
    }
}

// const placeBatchLimitOrder = async () => {
//     try {
//         const { bid, ask } = await getOrderBookPrice()
//         const obj = {
//             symbol,
//             workingSide: "BUY",
//             workingType: "LIMIT",
//             workingPrice: (parseFloat(bid) - 1).fix(2),
//             workingQuantity: (6/(parseFloat(bid) - 1)).fix(5),
//             pendingSide: "SELL",
//             pendingQuantity: (6/(parseFloat(bid) - 1)).fix(5),
//             pendingPrice: (parseFloat(bid) - 2.99).fix(2),
//             pendingStopPrice: (parseFloat(bid) - 3).fix(2),
//             pendingType: "STOP_LOSS_LIMIT"
//         }
//         const sig = createSignature(obj)
//         const payload = {...obj, ...sig}
//         const res = await axios({
//             url: 'https://www.binance.com/bapi/mbx/v1/private/mbxgateway/order/oto/place',
//             method: 'POST',
//             headers: {
//                 'X-MBX-APIKEY': process.env.BINANCE_API_KEY,
//                 'Content-Type': 'application/json',
//                 'Cookie': `bnc-uuid=fbc836c4-3bcf-42c0-be18-2dc84c6308c1; se_gd=woHUhRhpRENUhcGFQClUgZZCgVQkABVVlEUJeUUF1ZSWgV1NWUQU1; userPreferredCurrency=USD_USD; se_gsd=dDMgBRFwISw0CRIxNwwxFQwtDlYDDgEEUltHWlFUUlZUCVNT1; BNC-Location=BINANCE; campaign=accounts.binance.com; changeBasisTimeZone=; _gcl_au=1.1.1111387445.1717701979; BNC_FV_KEY=332f75a36e43a77b94d62db3b908cbbc63084fc2; theme=light; OptanonAlertBoxClosed=2024-06-29T18:03:02.339Z; _gid=GA1.2.484096727.1721656736; se_sd=xQbUADl5TGSUwoONRFhJgZZUBFggEEVWlEGFRU0ZFBSVgFlNWUAO1; logined=y; _uetvid=b58e97a0289e11ef9843b9989c60a87c; profile-setting=setted; source=spot_trading_fee; sensorsdata2015jssdkcross=%7B%22distinct_id%22%3A%2236015938%22%2C%22first_id%22%3A%2219037d6ad2a114b-0a901e573ac902-11462c6f-2073600-19037d6ad2b1cfd%22%2C%22props%22%3A%7B%22%24latest_traffic_source_type%22%3A%22%E8%87%AA%E7%84%B6%E6%90%9C%E7%B4%A2%E6%B5%81%E9%87%8F%22%2C%22%24latest_search_keyword%22%3A%22%E6%9C%AA%E5%8F%96%E5%88%B0%E5%80%BC%22%2C%22%24latest_referrer%22%3A%22https%3A%2F%2Fwww.google.com%2F%22%2C%22%24latest_utm_source%22%3A%22spot_trading_fee%22%7D%2C%22identities%22%3A%22eyIkaWRlbnRpdHlfY29va2llX2lkIjoiMTkwMzdkNmFkMmExMTRiLTBhOTAxZTU3M2FjOTAyLTExNDYyYzZmLTIwNzM2MDAtMTkwMzdkNmFkMmIxY2ZkIiwiJGlkZW50aXR5X2xvZ2luX2lkIjoiMzYwMTU5MzgifQ%3D%3D%22%2C%22history_login_id%22%3A%7B%22name%22%3A%22%24identity_login_id%22%2C%22value%22%3A%2236015938%22%7D%2C%22%24device_id%22%3A%2219037d6c5ce18e-03413f23bfaa98a-11462c6f-2073600-19037d6c5cf1a50%22%7D; cr00=A9411CD80FCEC071BD875DB865DF7B90; d1og=web.36015938.24E85148FBB353DB94A5646C7878E67A; r2o1=web.36015938.198E31E255B88C3D26A4B09803838BDC; f30l=web.36015938.2C627FA18B775A162FA002919E2403C2; __BNC_USER_DEVICE_ID__={"d41d8cd98f00b204e9800998ecf8427e":{"date":1722109793392,"value":""}}; p20t=web.36015938.EF4B5A1A6DEC787D7F706D8EBE4097CB; futures-layout=pro; BNC_FV_KEY_T=101-yTLFoWzoCGTQsmAI274AnlFsicUuBV5nS56L16y6vje5EtEcxVJqiy1jOgetUheNX5sYuNx%2BUDsccmFWzO3QAg%3D%3D-aGSmEV4rMrV39%2FQSPAinbw%3D%3D-e9; BNC_FV_KEY_EXPIRE=1722167986878; _gat_UA-162512367-1=1; OptanonConsent=isGpcEnabled=0&datestamp=Sun+Jul+28+2024+13%3A49%3A37+GMT%2B0700+(Indochina+Time)&version=202406.1.0&browserGpcFlag=0&isIABGlobal=false&hosts=&consentId=79f5c235-b94f-49a5-afd9-ddf68b6c1c7a&interactionCount=2&isAnonUser=1&landingPath=NotLandingPage&groups=C0001%3A1%2CC0003%3A1%2CC0004%3A1%2CC0002%3A1&AwaitingReconsent=false&geolocation=VN%3BSG; lang=en; _ga=GA1.2.1128909663.1718923734; _ga_3WP50LGEEC=GS1.1.1722146385.161.1.1722149395.41.0.0`,
//                 'Csrftoken': 'f9b769f401e3dfbb14f727ab38f2beed',
//                 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
//                 'Clienttype': 'web',
//             },
//             data: payload
//         })

//         console.log(res.data.data.orders)
//     } catch (error) {
//         console.log(error)
//     }
// }

// placeBatchLimitOrder('BTCFDUSD')

const placeBatchIsolatedOrder = async () => {
    try {
        const { base, quote } = await getBorrowBalance() 
        const { bid, ask } = await getOrderBookPrice()
        let balance = Number(quote)/(parseFloat(bid) - limit)
        if(Number(quote)/(parseFloat(bid) - limit) >= Number(base)) balance = Number(base)
        await redis.set('amt', (balance).fix(5))
            const limitOrder = client.marginOrder({
                symbol,
                isIsolated: true,
                side: 'BUY',
                type: 'LIMIT',
                quantity: (Number(quote)/(parseFloat(bid) - limit)).fix(5),
                price: (parseFloat(bid) - limit + 0.01).fix(2),
                sideEffectType: 'MARGIN_BUY'
            })
            const stoplossOrder = client.marginOrder({
                symbol,
                isIsolated: true,
                side: "SELL",
                type: 'STOP_LOSS_LIMIT',
                quantity: balance.fix(5),
                price: (parseFloat(bid) - limit - stop + 0.021).fix(2),
                stopPrice: (parseFloat(bid) - limit - stop + 0.011).fix(2)
            })
            Promise.all([limitOrder, stoplossOrder])
            .then(responses => {
                console.log('order success')
            })
            .catch(error => {
                console.log(error)
                console.error('An error occurred');
                redis.set('error', 1)
            });
        return
    } catch (error) {
        console.log(error)
    }
}

const cancelMarginOrder = async (orderId) => {
    try {
        const order = await client.marginGetOrder({
            symbol,
            orderId,
            isIsolated: true
        })
        console.log(order)
        if(!order?.orderId || order?.status == 'FILLED' || order?.status == 'PARTIALLY_FILLED') return 'no'
        await client.marginCancelOrder({
            symbol,
            orderId,
            isIsolated: true
        })
        return true
    } catch (error) {
        console.log(error)
    }
}

const updateBatchIsolatedOrder = async () => {
    try { 
        const orders = await client.marginOpenOrders({
            symbol,
            isIsolated: true
        })
        if(orders.length >= 1 && (orders[0]?.type == 'LIMIT' || orders[1]?.type == 'LIMIT')) {
            let t = 0
            for(let order of orders) {
                const result = await cancelMarginOrder(order.orderId)
                if(result == 'no') t = 1
            }
            if(t == 1) return
            await placeBatchIsolatedOrder()
        }
        return true
    } catch (error) {
        console.log(error.errors)
    }
}

const cancelBatchIsolatedOrder = async () => {
    try {
        console.log('start batch cancel')
        const orders = await client.marginOpenOrders({
            symbol,
            isIsolated: true
        })
        for(let order of orders) {
            await cancelMarginOrder(order.orderId)
        }
        return true
    } catch (error) {
        throw new Error(error)
    }
}

const sellFunc = async () => {
    try {
        try {
            const orders = await client.marginOpenOrders({
                symbol,
                isIsolated: true
            })
            for(let order of orders) {
                await cancelMarginOrder(order.orderId)
            }
        } catch (error) {
            throw new Error
        }
        const { base, quote } = await getBorrowBalance()
        const { bid, ask } = await getOrderBookPrice()
        if(Number(quote)/(Number(base)*Number(ask)) <= 0.3) {

            await client.marginOrder({
                symbol,
                isIsolated: true,
                side: 'SELL',
                type: 'LIMIT',
                quantity: await redis.get('amt') || 0.00014,
                price: (Number(ask) + 1.011 ).fix(2)
            })
            return console.log('sell end')
        }
        return
    } catch (error) {
        console.log(error)
    }
} 

cron.schedule('0 * * * * *', placeBatchIsolatedOrder, {
    scheduled: true,
    timezone: 'Etc/GMT'
});

cron.schedule('2,4,6,8,10 * * * * *', updateBatchIsolatedOrder, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
  
cron.schedule('40 * * * * *', cancelBatchIsolatedOrder, {
    scheduled: true,
    timezone: 'Etc/GMT'
});

cron.schedule('45,47,49,51,53,55 * * * * *', sellFunc, {
    scheduled: true,
    timezone: 'Etc/GMT'
});
console.log('Scheduler sell started');

