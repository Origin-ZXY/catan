import {newGame,applyAction,RES,emptyResources,log,updateAwards,legalRoads} from './game.js?v=780fbcd3e213';
import {aiTurn} from './ai.js?v=6c69593c2023';

export const LESSON_INFO={
 basic:{name:'基础开局',description:'选址、收资源、交易与建设',time:'约 2 分钟'},
 robber:{name:'强盗与七点',description:'弃牌、封锁地块、随机偷取',time:'约 1 分钟'},
 buy:{name:'购买发展卡',description:'购买费用与新卡使用时机',time:'约 30 秒'},
 knight:{name:'骑士与最大骑士团',description:'移动强盗、累计骑士、争取 2 分',time:'约 1 分钟'},
 roads:{name:'道路建设卡',description:'连续免费放置两条道路',time:'约 30 秒'},
 plenty:{name:'丰收卡',description:'从银行任选两张资源',time:'约 30 秒'},
 monopoly:{name:'垄断卡',description:'收走其他玩家的一种资源',time:'约 30 秒'},
 point:{name:'胜利点牌',description:'抽到后立即隐藏计分',time:'约 30 秒'}
};

const devOpen={group:1,title:'打开你的发展卡',text:'点「发展卡」，看看这次练习要使用的卡牌。',target:'#quick-dev'};
const useCard={group:1,title:'使用这张旧卡',text:'这张卡在之前的回合购买，现在可以使用。每回合最多使用一张发展卡。',target:'[data-action="use-dev"]'};
const firstFreeRoad=s=>`[data-edge="${legalRoads(s,0)[0]}"]`;
export const ADVANCED_STEPS={
 robber:[
  {group:1,title:'七点：先选三张木材',text:'练习局面刚掷出 7。你有 10 张资源，要弃掉一半。先点木材的「＋」三次。',target:'[data-action="discard-plus"][data-res="wood"]'},
  {group:1,title:'再选两张砖块',text:'再点砖块的「＋」两次，就选够了要弃置的 5 张。超过 7 张才需要弃牌。',target:'[data-action="discard-plus"][data-res="brick"]'},
  {group:1,title:'确认弃置五张资源',text:'弃牌归还银行。等所有需要弃牌的人完成后，才能移动强盗。',target:'[data-action="confirm-discard"]'},
  {group:2,title:'把强盗移到羊毛 8',text:'点高亮地块。强盗必须离开原位置，可以移到其他资源地或沙漠。',target:'.robber-target[data-tile="1"]'},
  {group:3,title:'封锁产出，随机偷一张',text:'羊毛 8 在强盗离开前不再产资源。你也从相邻蓝色村庄的主人手中随机拿走了一张资源。',target:'[data-tile="1"]',ack:'完成，返回对局',done:true}
 ],
 buy:[
  {...devOpen,text:'发展卡需要羊毛、麦穗、矿石各一张。先打开「发展卡」。'},
  {group:1,title:'花三种材料购买',text:'花羊毛、麦穗、矿石各一张，从牌堆抽一张卡。牌的种类不能自己挑。',target:'[data-action="buy-dev"]'},
  {group:2,title:'新买的行动卡要等一回合',text:'这次抽到骑士。「下回合」表示要到下一个自己的回合才能使用。已有卡可以在掷骰前用。',target:'.dev-card',ack:'完成，返回对局',done:true}
 ],
 knight:[
  {...devOpen,text:'练习中你已经用过 2 张骑士，手里还有一张旧骑士。先打开「发展卡」。'},
  {...useCard,title:'打出第三张骑士',text:'点「使用」。最大骑士团计算的是已经打出的骑士张数。'},
  {group:2,title:'最大骑士团：增加两分',text:'率先打出至少 3 张骑士，可获得最大骑士团的 2 分。别人打出更多骑士就能夺走，平局保留给原持有者。',target:'#army-award',ack:'继续移动强盗'},
  {group:3,title:'骑士也能移动强盗',text:'点羊毛 8，把强盗从自己的木材 5 移走，并从相邻对手手中随机拿一张。骑士不会触发弃牌。',target:'.robber-target[data-tile="1"]'},
  {group:3,title:'用卡后仍然需要掷骰',text:'这次是在掷骰前使用骑士，结算后还要掷骰。本回合已经用过发展卡，不能再用第二张。',target:'#quick-turn',ack:'完成，返回对局',done:true}
 ],
 roads:[
  {...devOpen,text:'练习中资源为 0，但手里有一张旧的道路建设卡。先打开「发展卡」。'},
  {...useCard,title:'使用道路建设卡',text:'这张卡可以免费修两条道路，仍然需要连接自己的领地。'},
  {group:2,title:'放下第一条免费道路',text:'点高亮边。没有花费木材或砖块。',target:firstFreeRoad},
  {group:2,title:'连续放下第二条道路',text:'点下一条高亮边。先连续结算免费道路，再继续交易或其他建设。',target:firstFreeRoad},
  {group:3,title:'两条道路都建好了',text:'道路增加了两条，手里的资源仍然是 0。没有合法位置或剩余棋子时，只放能放的数量。',target:'#resources',ack:'完成，返回对局',done:true}
 ],
 plenty:[
  {...devOpen,text:'这次练习使用「丰收」，可以从银行任选两张资源。先打开「发展卡」。'},
  {...useCard,title:'使用丰收卡'},
  {group:2,title:'先选一张砖块',text:'点砖块。丰收可以拿不同种类，也可以拿同一种；银行必须有库存。',target:'[data-action="pick-resource"][data-res="brick"]'},
  {group:2,title:'再选一张麦穗',text:'这次点麦穗，凑够两张资源。',target:'[data-action="pick-resource"][data-res="wheat"]'},
  {group:2,title:'确认领取资源',text:'确认后，这两张资源会直接从银行加入你的手牌。',target:'[data-action="confirm-picked"]'},
  {group:3,title:'新材料已经到手',text:'手里多了 1 砖块和 1 麦穗。你可以用这些材料继续建设或交易。',target:'#resources',ack:'完成，返回对局',done:true}
 ],
 monopoly:[
  {...devOpen,text:'练习中你有 1 矿石，小满有 2 矿石，阿屿有 3 矿石。先打开「发展卡」。'},
  {...useCard,title:'使用垄断卡'},
  {group:2,title:'选择要垄断的资源',text:'这次点矿石。其他所有玩家都要交出手里全部的这种资源。',target:'[data-action="pick-resource"][data-res="ore"]'},
  {group:2,title:'确认垄断矿石',text:'你会从两位对手手中共拿到 5 张矿石。',target:'[data-action="confirm-picked"]'},
  {group:3,title:'现在共有六张矿石',text:'原来的 1 张，加上从对手收来的 5 张，一共 6 张。垄断拿的是对手手里的资源。',target:'.resource-card.ore',ack:'完成，返回对局',done:true}
 ],
 point:[
  {...devOpen,text:'练习已经备好购买材料。这一段看看抽到胜利点牌时会发生什么。'},
  {group:1,title:'购买一张发展卡',text:'点「购买发展卡」。本练习的牌堆预设会抽到一张胜利点牌。',target:'[data-action="buy-dev"]'},
  {group:2,title:'胜利点立即计入分数',text:'这张牌已经增加了 1 分，无需点击使用，也不受新购行动卡的等待限制。对手看不到你的隐藏分。',target:'.dev-card',ack:'完成，返回对局',done:true}
 ]
};

function practiceBase(){
 const s=newGame(25,{playerCount:3,startPlayer:0,combinedTradeBuild:true});
 for(const [type,id]of[['settlement',31],['road',39]])applyAction(s,0,{type,id});
 while(s.current!==0)aiTurn(s,s.current);
 for(const [type,id]of[['settlement',19],['road',23]])applyAction(s,0,{type,id});
 applyAction(s,0,{type:'roll'});
 for(const deal of[{with:1,give:{sheep:1},get:{wheat:1}},{with:2,give:{wood:1},get:{brick:1}}]){applyAction(s,0,{type:'offer',...deal});aiTurn(s,deal.with);}
 applyAction(s,0,{type:'road',id:16});applyAction(s,0,{type:'settlement',id:2});
 for(const p of s.players)p.resources=emptyResources();s.bank=Object.fromEntries(RES.map(r=>[r,19]));
 s.production=[];s.dice=null;s.logs=[];s.turn=10;
 log(s,'独立教学练习局面',0,'start');return s;
}
function give(s,p,cards){for(const[r,n]of Object.entries(cards)){s.bank[r]-=n;s.players[p].resources[r]+=n;}}
function oldCard(s,type){s.deck.splice(s.deck.indexOf(type),1);s.players[0].dev.push({type,bought:9,id:s.eventId++});}
function topCard(s,type){s.deck.push(...s.deck.splice(s.deck.indexOf(type),1));}
export function createLessonState(lesson='basic'){
 if(lesson==='basic'||!LESSON_INFO[lesson])return newGame(25,{playerCount:3,startPlayer:0,combinedTradeBuild:true});
 const s=practiceBase();
 if(lesson==='robber'){
  give(s,0,{wood:4,brick:2,sheep:2,wheat:1,ore:1});give(s,1,{wood:2,brick:2,sheep:2,wheat:2});give(s,2,{ore:3,wheat:1,wood:1});
  s.phase='discard';s.dice=[3,4];s.discardRequired=[5,4,0];s.discardLeft=5;s.returnPhase='build';
 }else if(lesson==='buy'||lesson==='point'){
  give(s,0,{sheep:1,wheat:1,ore:1});topCard(s,lesson==='point'?'point':'knight');
 }else if(lesson==='knight'){
  give(s,0,{wood:4,brick:2,sheep:2,wheat:1,ore:1});give(s,1,{ore:2,wheat:2,brick:1,sheep:1,wood:1});give(s,2,{wood:2,brick:2,ore:2});
  for(let i=0;i<2;i++){s.deck.splice(s.deck.indexOf('knight'),1);s.playedCards.push({type:'knight',player:0});}
  s.players[0].knights=2;oldCard(s,'knight');s.phase='roll';s.robber=s.tiles.find(t=>t.type==='wood'&&t.number===5).id;updateAwards(s);
 }else if(lesson==='roads')oldCard(s,'roads');
 else if(lesson==='plenty'){give(s,0,{wood:1});oldCard(s,'plenty');}
 else if(lesson==='monopoly'){give(s,0,{ore:1,wood:1});give(s,1,{ore:2,wheat:1});give(s,2,{ore:3,brick:1});oldCard(s,'monopoly');}
 return s;
}

export function advanceAdvanced(lesson,step,s,ui){
 const p=s.players[0],roadCount=s.edges.filter(e=>e.owner===0).length;
 const played=type=>s.playedCards.some(c=>c.player===0&&c.type===type);
 for(let i=0;i<10;i++){
  let ready=false;
  if(lesson==='robber')ready=step===0?(ui.discarded?.wood??0)>=3:step===1?(ui.discarded?.brick??0)>=2:step===2?s.phase==='robber':step===3?s.robber===1&&s.phase==='build':false;
  else if(lesson==='buy'||lesson==='point')ready=step===0?ui.modal==='dev':step===1?p.dev.some(c=>c.bought===s.turn):false;
  else if(lesson==='knight')ready=step===0?ui.modal==='dev':step===1?p.knights===3:step===3?s.phase==='roll'&&s.robber===1:false;
  else if(lesson==='roads')ready=step===0?ui.modal==='dev':step===1?s.phase==='road-building':step===2?roadCount>=4:step===3?roadCount>=5:false;
  else if(lesson==='plenty')ready=step===0?ui.modal==='dev':step===1?ui.modal==='picker':step===2?ui.picked?.includes('brick'):step===3?ui.picked?.includes('wheat'):step===4?played('plenty'):false;
  else if(lesson==='monopoly')ready=step===0?ui.modal==='dev':step===1?ui.modal==='picker':step===2?ui.picked?.includes('ore'):step===3?played('monopoly'):false;
  if(!ready)break;step++;
 }
 return step;
}

export function resumeAdvanced(lesson,step){
 if(lesson==='robber')return step<=2?0:step;
 if(lesson==='buy'||lesson==='point')return 0;
 if(lesson==='knight')return step<=1?0:step;
 if(lesson==='roads')return step<=1?0:step;
 if(lesson==='plenty')return step<=4?0:step;
 if(lesson==='monopoly')return step<=3?0:step;
 return step;
}
