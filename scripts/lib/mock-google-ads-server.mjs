import http from 'node:http';

export class MockGoogleAdsServer {
  constructor(){this.server=null;this.url='';this.reset();}
  reset(){this.requests=[];this.failMutate=false;this.geoAvailable=true;this.managerMode=false;this.sequence=100;this.refreshCount=0;}
  async start(){this.server=http.createServer((req,res)=>this.handle(req,res));await new Promise(resolve=>this.server.listen(0,'127.0.0.1',resolve));this.url=`http://127.0.0.1:${this.server.address().port}`;}
  async stop(){if(this.server)await new Promise(resolve=>this.server.close(resolve));}
  json(res,status,body){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));}
  async body(req){const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks).toString('utf8');if((req.headers['content-type']||'').includes('application/x-www-form-urlencoded'))return Object.fromEntries(new URLSearchParams(raw));try{return raw?JSON.parse(raw):{};}catch{return {};}}
  async handle(req,res){
    const url=new URL(req.url,'http://mock.local');const body=await this.body(req);this.requests.push({method:req.method,path:url.pathname,headers:{...req.headers},body,query:Object.fromEntries(url.searchParams)});
    if(url.pathname==='/oauth/token'&&req.method==='POST'){
      if(body.grant_type==='refresh_token'){this.refreshCount++;return this.json(res,200,{access_token:`GOOGLE_REFRESHED_${this.refreshCount}`,expires_in:3600,scope:'https://www.googleapis.com/auth/adwords'});}
      if(body.code!=='GOOGLE_OAUTH_CODE')return this.json(res,400,{error:'invalid_grant',error_description:'Invalid mock authorization code.'});
      return this.json(res,200,{access_token:'GOOGLE_ACCESS',refresh_token:'GOOGLE_REFRESH',expires_in:3600,scope:'https://www.googleapis.com/auth/adwords'});
    }
    if(!String(req.headers.authorization||'').startsWith('Bearer '))return this.json(res,401,{error:{message:'Missing bearer token.',code:401,status:'UNAUTHENTICATED'}});
    if(url.pathname.endsWith('/customers:listAccessibleCustomers'))return this.json(res,200,{resourceNames:[`customers/${this.managerMode?'9999999999':'1111111111'}`]});
    if(url.pathname.endsWith('/googleAds:search')){
      const customerId=(url.pathname.match(/customers\/(\d+)/)||[])[1];const query=String(body.query||'');
      if(query.includes('FROM customer_client'))return this.json(res,200,{results:[{customerClient:{id:'1111111111',descriptiveName:'Mock Child Ads',currencyCode:'ARS',status:'ENABLED',manager:false,level:'1',testAccount:true}}]});
      return this.json(res,200,{results:[{customer:{id:customerId,descriptiveName:this.managerMode?'Mock Manager':'Mock Google Ads',currencyCode:'ARS',status:'ENABLED',manager:this.managerMode,testAccount:true}}]});
    }
    if(url.pathname.endsWith('/geoTargetConstants:suggest')){
      if(!this.geoAvailable)return this.json(res,200,{geoTargetConstantSuggestions:[]});
      const code=String(body.countryCode||'AR').toUpperCase();return this.json(res,200,{geoTargetConstantSuggestions:[{geoTargetConstant:{resourceName:`geoTargetConstants/${code==='AR'?'2032':'9999'}`,countryCode:code,targetType:'COUNTRY',status:'ENABLED'}}]});
    }
    if(url.pathname.endsWith('/googleAds:mutate')){
      if(this.failMutate)return this.json(res,500,{error:{message:'Mock mutate failed.',code:13,status:'INTERNAL'}});
      const customerId=(url.pathname.match(/customers\/(\d+)/)||[])[1];const responses=[];
      for(const operation of body.mutateOperations||[]){
        const key=Object.keys(operation)[0];const create=operation[key]?.create||{};const rn=create.resourceName||'';
        if(key==='campaignBudgetOperation')responses.push({campaignBudgetResult:{resourceName:rn.replace('/-1',`/${++this.sequence}`)}});
        else if(key==='campaignOperation')responses.push({campaignResult:{resourceName:rn.replace('/-2',`/${++this.sequence}`)}});
        else if(key==='campaignCriterionOperation')responses.push({campaignCriterionResult:{resourceName:`customers/${customerId}/campaignCriteria/${++this.sequence}~${++this.sequence}`}});
        else if(key==='adGroupOperation')responses.push({adGroupResult:{resourceName:rn.replace('/-3',`/${++this.sequence}`)}});
        else if(key==='adGroupCriterionOperation')responses.push({adGroupCriterionResult:{resourceName:`customers/${customerId}/adGroupCriteria/${++this.sequence}~${++this.sequence}`}});
        else if(key==='assetOperation')responses.push({assetResult:{resourceName:rn.replace(/\/-[45]$/,`/${++this.sequence}`)}});
        else if(key==='adGroupAdOperation')responses.push({adGroupAdResult:{resourceName:`customers/${customerId}/adGroupAds/${++this.sequence}~${++this.sequence}`}});
      }
      return this.json(res,200,{mutateOperationResponses:responses});
    }
    return this.json(res,404,{error:{message:`Unhandled ${req.method} ${url.pathname}`,code:404,status:'NOT_FOUND'}});
  }
}

export class MockGoogleAssetPolicy {
  async destination(rawUrl){if(!String(rawUrl).includes('/producto/'))throw new Error('Unexpected destination');return 'https://store.example.com/producto/mock';}
  async image(rawUrl){return {bytes:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlksAAAAASUVORK5CYII=',url:String(rawUrl),type:'image/png'};}
}
