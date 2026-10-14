const base=process.env.BROWSER_BASE_URL||'http://127.0.0.1:3192';
(async()=>{
  for(let attempt=0;attempt<30;attempt++){
    try{const response=await fetch(base);if(response.ok&&(await response.text()).includes('<html'))return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error(`Production preview unavailable: ${base}`);
})().catch(error=>{console.error(error);process.exit(1)});
