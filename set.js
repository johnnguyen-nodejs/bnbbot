import { redis } from './lib.js'
for(let i = 0; i < 10; i++){
    await redis.set(`stt${i}`, 0)
    console.log(`set ${i}`, 0)
}
await redis.set('amountBuy', 0)