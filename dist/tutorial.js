import {ADVANCED_STEPS,advanceAdvanced,resumeAdvanced} from './lessons.js?v=40bf9d92d659';
// A short guided first turn. Every move still uses the regular rules engine.
export const GUIDE_STEPS=[
 {group:1,title:'先选第一座村庄',text:'点亮着的交点。村庄放在交点上，可以同时挨着几种资源。',target:'[data-vertex="31"]'},
 {group:1,title:'确认这个起点',text:'这里挨着木材 5、羊毛 5、木材 8。数字对应两颗骰子的点数之和。',target:'.confirm-setup-inline'},
 {group:1,title:'给村庄接一条道路',text:'点亮着的边，选择这条初始道路。开局的两组村庄和道路都免费。',target:'[data-edge="39"]'},
 {group:1,title:'确认道路方向',text:'这条路会成为以后向外扩建的起点。',target:'.confirm-setup-inline'},
 {group:2,title:'等其他居民选址',text:'大家先顺序放第一组，再逆序放第二组。马上又会轮到你。',target:'#players',waiting:true},
 {group:2,title:'选择第二座村庄',text:'点高亮交点。第二座村庄会立刻给你相邻地块的起始资源。',target:'[data-vertex="19"]'},
 {group:2,title:'领取起始资源',text:'确认后，你会拿到木材、砖块和羊毛各一张。',target:'.confirm-setup-inline'},
 {group:2,title:'再接一条初始道路',text:'这条路必须紧邻刚放下的第二座村庄。点高亮的边。',target:'[data-edge="23"]'},
 {group:2,title:'完成开局',text:'确认道路后，你就有两座村庄，已经是 2 分了。',target:'.confirm-setup-inline'},
 {group:3,title:'现在掷骰子',text:'点「掷骰子」。有房子挨着对应数字的地块，就能拿资源；所有玩家都一样。',target:'#quick-turn'},
 {group:3,title:'看看你的收获',text:'这次是 5 点，两座村庄合计收到 2 木材和 1 羊毛。别人掷骰时，你也能收资源。',target:'#resources',ack:'看懂了，去交易'},
 {group:4,title:'换一张缺少的麦穗',text:'点「资源交易」。我们先用多余的 1 羊毛，向小满换 1 麦穗。',target:'#trade-trigger'},
 {group:4,title:'发出这份报价',text:'羊毛和麦穗各填好了 1。点「发出报价」，等对方决定是否接受。',target:'[data-action="confirm-trade"]'},
 {group:4,title:'等待对方回应',text:'双方同意后资源才会交换。小满正在考虑这笔报价。',target:'#dialog',waiting:true},
 {group:4,title:'再换一张砖块',text:'点「资源交易」，这次用 1 木材向阿屿换 1 砖块，为修路和建房备料。',target:'#trade-trigger'},
 {group:4,title:'确认第二笔交易',text:'报价也已填好。点「发出报价」，对方接受后就凑齐材料了。',target:'[data-action="confirm-trade"]'},
 {group:4,title:'等待这笔交易成交',text:'居民之间的交换比率可以商量。银行默认是 4 张同类资源换 1 张其他资源。',target:'#dialog',waiting:true},
 {group:5,title:'选择修建道路',text:'点「道路」。修一段路要花 1 木材和 1 砖块。道路负责把领地向外延伸。',target:'[data-kind="road"]'},
 {group:5,title:'把道路向外接一段',text:'点这条高亮边。普通道路必须连接自己的村庄、城市或道路。',target:'[data-edge="16"]'},
 {group:6,title:'准备建立新村庄',text:'剩下木材、砖块、羊毛、麦穗各一张，刚好够建一座村庄。点「村庄」。',target:'[data-kind="settlement"]'},
 {group:6,title:'在新位置落子',text:'点亮着的交点。这里连着自己的路，也与其他房子至少间隔两条边。',target:'[data-vertex="2"]'},
 {group:7,title:'你已经有 3 分了',text:'新村庄增加 1 分，以后也会收资源。升级城市则值 2 分，产量也变成两张。',target:'#players .player:first-child .player-score',ack:'继续'},
 {group:7,title:'把回合交给下一位',text:'点「结束回合」。没用完的资源会保留，之后继续收资源、交易和扩建。',target:'#quick-turn'},
 {group:7,title:'第一回合，学会了',text:'你已经完成选址、掷骰、交易、修路和建村庄。正式对局中，在自己的回合先到 10 分就赢。',target:'#players',ack:'完成，回到我的对局',done:true}
];

export const getGuideSteps=(lesson='basic')=>ADVANCED_STEPS[lesson]??GUIDE_STEPS;
export const getGuideTarget=(step,s)=>typeof step.target==='function'?step.target(s):step.target;

export function advanceGuide(step,s,ui,lesson='basic'){
 if(lesson!=='basic')return advanceAdvanced(lesson,step,s,ui);
 const me=s.players[0],choice=ui.choice;
 for(let i=0;i<GUIDE_STEPS.length;i++){
  let ready=false;
  switch(step){
   case 0:ready=choice?.type==='settlement'&&choice.id===31;break;
   case 1:ready=s.phase==='setup-road'&&s.setupVertex===31;break;
   case 2:ready=choice?.type==='road'&&choice.id===39;break;
   case 3:ready=s.setupIndex>=1;break;
   case 4:ready=s.current===0&&s.phase==='setup-settlement'&&s.setupIndex===5;break;
   case 5:ready=choice?.type==='settlement'&&choice.id===19;break;
   case 6:ready=s.phase==='setup-road'&&s.setupVertex===19;break;
   case 7:ready=choice?.type==='road'&&choice.id===23;break;
   case 8:ready=s.phase==='roll'&&s.current===0&&s.setupIndex===6;break;
   case 9:ready=s.phase==='build'&&!!s.dice;break;
   case 11:ready=ui.modal==='trade';break;
   case 12:ready=!!s.offer;break;
   case 13:ready=!s.offer&&me.resources.wheat>=1;break;
   case 14:ready=ui.modal==='trade';break;
   case 15:ready=!!s.offer;break;
   case 16:ready=!s.offer&&me.resources.brick>=2;break;
   case 17:ready=ui.mode==='road';break;
   case 18:ready=s.edges[16].owner===0;break;
   case 19:ready=ui.mode==='settlement';break;
   case 20:ready=s.vertices[2].owner===0;break;
   case 22:ready=s.current!==0;break;
  }
  if(!ready)break;step++;
 }
 return step;
}

export function guideTrade(step){
 if([11,12].includes(step))return{with:1,give:{sheep:1},get:{wheat:1}};
 if([14,15].includes(step))return{with:2,give:{wood:1},get:{brick:1}};
 return null;
}

export function resumeGuideStep(step,lesson='basic'){if(lesson!=='basic')return resumeAdvanced(lesson,step);return({1:0,3:2,6:5,8:7,12:11,15:14,18:17,20:19})[step]??step;}

export function positionGuide(layer,target){
 const card=layer.querySelector('.tutorial-card'),ring=layer.querySelector('.tutorial-highlight');
 const w=document.documentElement.clientWidth,h=document.documentElement.clientHeight;
 card.style.width=Math.min(345,w-24)+'px';
 if(!target||!target.getClientRects().length){ring.hidden=true;card.style.left='50%';card.style.top='50%';card.style.transform='translate(-50%,-50%)';return;}
 const r=target.getBoundingClientRect(),pad=7;
 ring.hidden=false;Object.assign(ring.style,{left:r.left-pad+'px',top:r.top-pad+'px',width:r.width+pad*2+'px',height:r.height+pad*2+'px'});
 card.style.transform='none';const cw=card.offsetWidth,ch=card.offsetHeight;
 let left=Math.max(12,Math.min(w-cw-12,r.left+r.width/2-cw/2)),top=r.bottom+18;
 if(top+ch>h-12)top=r.top-ch-18;
 if(top<12){top=Math.max(12,h-ch-12);if(r.right+cw+18<w){left=r.right+18;top=Math.max(12,Math.min(h-ch-12,r.top));}else if(r.left-cw-18>0){left=r.left-cw-18;top=Math.max(12,Math.min(h-ch-12,r.top));}}
 card.style.left=left+'px';card.style.top=top+'px';
}
