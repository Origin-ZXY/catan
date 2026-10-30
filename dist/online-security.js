let sdk;
function loadSDK(){
  if(window.turnstile)return Promise.resolve(window.turnstile);
  if(sdk)return sdk;
  sdk=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=catanTurnstileReady';script.async=true;
    const timer=setTimeout(()=>fail(),15000);
    const fail=()=>{clearTimeout(timer);script.remove();sdk=null;reject(new Error('无法载入人机验证，请检查网络后刷新页面'));};
    script.onerror=fail;
    window.catanTurnstileReady=()=>{clearTimeout(timer);if(window.turnstile)resolve(window.turnstile);else fail();};
    document.head.append(script);
  });
  return sdk;
}

/** Only a new seat needs verification. Its token stays in memory and is consumed once. */
export class RoomVerification{
  constructor(container,onChange){this.container=container;this.onChange=onChange;this.required=true;this.token='';this.active=true;this.widget=null;}
  get ready(){return this.active&&(!this.required||Boolean(this.token));}
  update(message){if(this.active)this.onChange(this.ready,message);}
  async mount(){
    this.update('正在载入人机验证…');
    try{
      const response=await fetch('/api/security',{signal:AbortSignal.timeout(15000)}),config=await response.json();
      if(!response.ok)throw new Error(config.message||'暂时无法载入人机验证，请稍后刷新页面');
      if(!this.active)return;
      this.required=config.required!==false;
      if(!this.required){this.update('本地联机已就绪');return;}
      if(!config.siteKey)throw new Error('人机验证尚未配置，请稍后再试');
      const api=await loadSDK();if(!this.active)return;
      this.api=api;
      const size=this.container.clientWidth>0&&this.container.clientWidth<300?'compact':'flexible';
      this.widget=api.render(this.container,{
        sitekey:config.siteKey,action:'catan_room',theme:'dark',size,language:'zh-cn','response-field':false,
        callback:token=>{if(this.active){this.token=typeof token==='string'?token:'';this.update(this.ready?'验证通过，可以创建或加入房间':'请完成人机验证');}},
        'expired-callback':()=>{this.token='';this.update('验证已过期，请重新验证');},
        'error-callback':()=>{this.token='';this.update('验证未完成，请检查网络或刷新页面');},
        'timeout-callback':()=>{this.token='';this.update('验证已超时，请重新验证');},
      });
    }catch(error){this.update(error.name==='TimeoutError'?'载入人机验证超时，请检查网络后刷新页面':error.message||'暂时无法载入人机验证，请稍后刷新页面');}
  }
  take(){
    if(!this.ready)throw new Error('请先完成人机验证');
    const token=this.token;this.token='';this.update('正在提交…');return token||undefined;
  }
  reset(){if(!this.active)return;this.token='';if(this.widget!==null)this.api.reset(this.widget);this.update(this.required?'请重新完成人机验证':'本地联机已就绪');}
  destroy(){this.active=false;this.token='';if(this.widget!==null)this.api.remove(this.widget);}
}
