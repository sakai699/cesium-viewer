Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6InMzcUt3VFMzcVVod3QxVFIiLCJqdGkiOiJlOTVjZjBjMy1lOGNlLTRlYTAtOGI1My1iMzE1NmFiNDE1NmEiLCJpZCI6NDc2NjUzLCJzdWIiOiJTYWthaUBAQEAiLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidmlld2VyLXB1YmxpYyIsImlhdCI6MTc4ODMxNjUxNX0.TR_dux4JPKa62yk92IoDpCr6zykwgbDz3r1RrMBBu8U";
const TERRAIN_ID = 2767062;

let viewer;
let mainAsset = null;
let mainKind = null;
let additionalModels = [];
let selectedModel = null;
let gizmoEntities = [];
let draggingAxis = null;
let dragStart = null;
let dragStartMatrix = null;
let heightColor = false;
let coordinateMode = false;
let measureMode = false;
let pinMode = false;
let measurePoints = [];
let measureEntities = [];
let annotations = [];
let currentPosition = null;
let selectedAnnotation = null;
let editingAnnotation = null;

const $ = id => document.getElementById(id);
const u = {
  mainId: $('mainAssetId'), loadMain: $('loadMainButton'), mainName: $('mainName'), mainType: $('mainType'), mainStatus: $('mainStatus'),
  addId: $('addAssetId'), add: $('addAssetButton'), list: $('modelList'), selected: $('selectedModelName'), step: $('gizmoStep'),
  resetTransform: $('resetTransformButton'), deleteSelected: $('deleteSelectedButton'), pointPanel: $('pointCloudPanel'),
  density: $('density'), densityValue: $('densityValue'), pointSize: $('pointSize'), pointSizeValue: $('pointSizeValue'),
  heightStep: $('heightStep'), heightColor: $('heightColorButton'), coord: $('coordButton'), measure: $('measureButton'),
  clearMeasure: $('clearMeasureButton'), coordinateResult: $('coordinateResult'), distanceResult: $('distanceResult'),
  addPin: $('addPinButton'), annotationInfo: $('annotationInfo'), popup: $('popup'), infoPopup: $('infoPopup'),
  title: $('titleInput'), memo: $('memoInput'), url: $('urlInput'), image: $('imageInput'), save: $('saveAnnotation'), cancel: $('cancelAnnotation'),
  infoTitle: $('infoTitle'), infoMemo: $('infoMemo'), infoUrl: $('infoUrl'), infoImage: $('infoImage'), edit: $('editAnnotation'), del: $('deleteAnnotation'), close: $('closeInfo')
};

function active(button, yes){ button?.classList.toggle('active', yes); }
function typeKey(value){ const t=String(value||'').toUpperCase().replace(/[ _-]/g,''); if(t.includes('3DTILE'))return'3DTILES'; if(t.includes('GLTF'))return'GLTF'; return t; }
function typeLabel(t){ return t==='3DTILES'?'3D Tiles':t==='GLTF'?'glTF':t; }
async function metadata(id){
  const r=await fetch(`https://api.cesium.com/v1/assets/${id}`,{headers:{Authorization:`Bearer ${Cesium.Ion.defaultAccessToken}`}});
  if(!r.ok) throw new Error(`metadata HTTP ${r.status}`); return r.json();
}
async function create3dAsset(id){
  const m=await metadata(id); const kind=typeKey(m.type); let primitive;
  if(kind==='3DTILES') primitive=await Cesium.Cesium3DTileset.fromIonAssetId(id);
  else if(kind==='GLTF'){ const resource=await Cesium.IonResource.fromAssetId(id); primitive=await Cesium.Model.fromGltfAsync({url:resource}); }
  else throw new Error(`追加・メイン表示は3D Tiles/glTFのみ対応: ${m.type}`);
  return {id,name:m.name||'(名称なし)',kind,primitive,initialMatrix:Cesium.Matrix4.clone(primitive.modelMatrix,new Cesium.Matrix4())};
}
function pointPanelEnabled(yes){ u.pointPanel.classList.toggle('disabled',!yes); u.pointPanel.querySelectorAll('input,button').forEach(x=>x.disabled=!yes); }
function applyPointStyle(){
  if(!mainAsset||mainKind!=='3DTILES')return;
  const size=String(Number(u.pointSize.value));
  if(!heightColor){ mainAsset.style=new Cesium.Cesium3DTileStyle({pointSize:size}); return; }
  const s=Number(u.heightStep.value)||10;
  mainAsset.style=new Cesium.Cesium3DTileStyle({pointSize:size,color:{conditions:[
    ["${POSITION}[2] > "+s*4,"color('red')"],["${POSITION}[2] > "+s*3,"color('orange')"],
    ["${POSITION}[2] > "+s*2,"color('yellow')"],["${POSITION}[2] > "+s,"color('lime')"],["true","color('blue')"]
  ]}});
}
async function loadMain(){
  const id=Number(u.mainId.value); if(!Number.isInteger(id)||id<1)return alert('正しいAsset IDを入力してください。');
  u.loadMain.disabled=true; u.mainStatus.textContent='読込中';
  try{
    const item=await create3dAsset(id);
    if(mainAsset)viewer.scene.primitives.remove(mainAsset);
    mainAsset=viewer.scene.primitives.add(item.primitive); mainKind=item.kind;
    u.mainName.textContent=item.name; u.mainType.textContent=typeLabel(item.kind); u.mainStatus.textContent=`読込済み: ${id}`;
    pointPanelEnabled(item.kind==='3DTILES');
    if(item.kind==='3DTILES'){mainAsset.maximumScreenSpaceError=Number(u.density.value);applyPointStyle();}
    await viewer.zoomTo(mainAsset);
  }catch(e){console.error(e);u.mainStatus.textContent='読込失敗';alert('メインAssetを読み込めませんでした。3D Tiles/glTF、トークン、権限を確認してください。');}
  finally{u.loadMain.disabled=false;}
}
async function addModel(){
  const id=Number(u.addId.value); if(!Number.isInteger(id)||id<1)return alert('正しいAsset IDを入力してください。');
  if(additionalModels.some(x=>x.id===id))return alert('このAssetは追加済みです。');
  u.add.disabled=true;
  try{ const item=await create3dAsset(id); item.primitive=viewer.scene.primitives.add(item.primitive); item.initialMatrix=Cesium.Matrix4.clone(item.primitive.modelMatrix,new Cesium.Matrix4()); additionalModels.push(item); renderList(); selectModel(item); await viewer.zoomTo(item.primitive); }
  catch(e){console.error(e);alert('追加モデルを読み込めませんでした。3D TilesまたはglTFを指定してください。');}
  finally{u.add.disabled=false;u.addId.value='';}
}
function renderList(){
  u.list.innerHTML='';
  additionalModels.forEach(item=>{
    const row=document.createElement('div'); row.className='model-item'+(selectedModel===item?' selected':'');
    const text=document.createElement('div'); text.innerHTML=`<div class="model-title">${escapeHtml(item.name)}</div><div class="model-meta">ID ${item.id} / ${typeLabel(item.kind)}</div>`;
    const buttons=document.createElement('div');
    const select=document.createElement('button');select.textContent='選択';select.onclick=()=>selectModel(item);
    const del=document.createElement('button');del.textContent='削除';del.className='danger';del.onclick=()=>removeModel(item);
    buttons.append(select,del);row.append(text,buttons);u.list.append(row);
  });
}
function escapeHtml(v){const d=document.createElement('div');d.textContent=String(v);return d.innerHTML;}
function removeModel(item){
  if(!confirm(`${item.name}を削除しますか？`))return;
  viewer.scene.primitives.remove(item.primitive);additionalModels=additionalModels.filter(x=>x!==item);
  if(selectedModel===item){selectedModel=null;clearGizmo();u.selected.textContent='モデル未選択';}renderList();
}
function selectModel(item){selectedModel=item;u.selected.textContent=`${item.name} / ID ${item.id}`;renderList();showGizmo();}

function modelCenter(item){
  if(item.kind==='3DTILES')return Cesium.Matrix4.multiplyByPoint(item.primitive.modelMatrix,item.primitive.boundingSphere.center,new Cesium.Cartesian3());
  return Cesium.Matrix4.getTranslation(item.primitive.modelMatrix,new Cesium.Cartesian3());
}
function clearGizmo(){gizmoEntities.forEach(e=>viewer.entities.remove(e));gizmoEntities=[];}
function showGizmo(){
  clearGizmo();if(!selectedModel)return;
  const c=modelCenter(selectedModel);const distance=Math.max(10,Cesium.Cartesian3.distance(viewer.camera.positionWC,c)*0.08);
  const enu=Cesium.Transforms.eastNorthUpToFixedFrame(c);
  const axes=[['X',Cesium.Cartesian3.UNIT_X,Cesium.Color.RED],['Y',Cesium.Cartesian3.UNIT_Y,Cesium.Color.LIME],['Z',Cesium.Cartesian3.UNIT_Z,Cesium.Color.DODGERBLUE]];
  axes.forEach(([axis,unit,color])=>{
    const local=Cesium.Cartesian3.multiplyByScalar(unit,distance,new Cesium.Cartesian3());
    const end=Cesium.Matrix4.multiplyByPoint(enu,local,new Cesium.Cartesian3());
    const entity=viewer.entities.add({name:`GIZMO_${axis}`,polyline:{positions:[c,end],width:8,material:color,clampToGround:false},position:end,label:{text:axis,fillColor:color,outlineColor:Cesium.Color.BLACK,outlineWidth:3,style:Cesium.LabelStyle.FILL_AND_OUTLINE,disableDepthTestDistance:Number.POSITIVE_INFINITY}});
    entity.gizmoAxis=axis;gizmoEntities.push(entity);
  });
}
function translateSelected(axis,pixels){
  if(!selectedModel)return;
  const sensitivity=(Number(u.step.value)||1)*0.02;
  const meters=pixels*sensitivity;
  const center=modelCenter(selectedModel);const enu=Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const column=axis==='X'?0:axis==='Y'?1:2;
  const direction=Cesium.Matrix4.getColumn(enu,column,new Cesium.Cartesian4());
  const delta=new Cesium.Cartesian3(direction.x*meters,direction.y*meters,direction.z*meters);
  const t=Cesium.Matrix4.fromTranslation(delta);
  selectedModel.primitive.modelMatrix=Cesium.Matrix4.multiply(t,dragStartMatrix,new Cesium.Matrix4());
  showGizmo();
}

function getPosition(screen,requireObject=false){
  const picked=viewer.scene.pick(screen);if(!Cesium.defined(picked))return null;
  if(requireObject){
    const validMain=mainAsset&&(picked.primitive===mainAsset||picked.content?.tileset===mainAsset);
    const validExtra=additionalModels.some(x=>picked.primitive===x.primitive||picked.content?.tileset===x.primitive);
    if(!validMain&&!validExtra)return null;
  }
  if(!viewer.scene.pickPositionSupported)return null;
  const p=viewer.scene.pickPosition(screen);return Cesium.defined(p)?p:null;
}
function clearMeasures(){measureEntities.forEach(e=>viewer.entities.remove(e));measureEntities=[];measurePoints=[];u.distanceResult.textContent='距離: -';}
function measurePoint(p,first){measureEntities.push(viewer.entities.add({position:p,point:{pixelSize:14,color:first?Cesium.Color.LIME:Cesium.Color.RED,outlineColor:Cesium.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));}
function finishMeasure(a,b){const d=Cesium.Cartesian3.distance(a,b);u.distanceResult.textContent=`距離: ${d.toFixed(2)} m`;measureEntities.push(viewer.entities.add({polyline:{positions:[a,b],width:4,material:Cesium.Color.YELLOW}}));const mid=Cesium.Cartesian3.midpoint(a,b,new Cesium.Cartesian3());measureEntities.push(viewer.entities.add({position:mid,label:{text:`${d.toFixed(2)} m`,fillColor:Cesium.Color.YELLOW,showBackground:true,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));}
function closePopups(){u.popup.style.display='none';u.infoPopup.style.display='none';u.title.value='';u.memo.value='';u.url.value='';u.image.value='';currentPosition=null;editingAnnotation=null;}
function showNote(a){selectedAnnotation=a;u.infoTitle.textContent=a.title;u.infoMemo.textContent=a.memo||'メモなし';if(a.url){u.infoUrl.href=/^https?:\/\//i.test(a.url)?a.url:`https://${a.url}`;u.infoUrl.textContent=a.url;u.infoUrl.style.display='block';}else u.infoUrl.style.display='none';if(a.imageUrl){u.infoImage.src=a.imageUrl;u.infoImage.style.display='block';}else u.infoImage.style.display='none';u.infoPopup.style.display='block';}

function bind(){
  u.loadMain.onclick=loadMain;u.mainId.onkeydown=e=>{if(e.key==='Enter')loadMain();};u.add.onclick=addModel;
  u.density.oninput=()=>{u.densityValue.textContent=u.density.value;if(mainKind==='3DTILES')mainAsset.maximumScreenSpaceError=Number(u.density.value);};
  u.pointSize.oninput=()=>{u.pointSizeValue.textContent=u.pointSize.value;applyPointStyle();};
  u.heightColor.onclick=()=>{heightColor=!heightColor;u.heightColor.textContent=`高さ着色 ${heightColor?'ON':'OFF'}`;active(u.heightColor,heightColor);applyPointStyle();};
  u.resetTransform.onclick=()=>{if(selectedModel){selectedModel.primitive.modelMatrix=Cesium.Matrix4.clone(selectedModel.initialMatrix,new Cesium.Matrix4());showGizmo();}};
  u.deleteSelected.onclick=()=>{if(selectedModel)removeModel(selectedModel);};
  u.coord.onclick=()=>{coordinateMode=!coordinateMode;measureMode=false;pinMode=false;active(u.coord,coordinateMode);active(u.measure,false);active(u.addPin,false);};
  u.measure.onclick=()=>{measureMode=!measureMode;coordinateMode=false;pinMode=false;measurePoints=[];active(u.measure,measureMode);active(u.coord,false);active(u.addPin,false);};
  u.clearMeasure.onclick=clearMeasures;
  u.addPin.onclick=()=>{pinMode=!pinMode;coordinateMode=false;measureMode=false;active(u.addPin,pinMode);active(u.coord,false);active(u.measure,false);u.annotationInfo.textContent=`ピン配置モード ${pinMode?'ON':'OFF'}`;};

  const h=new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  h.setInputAction(m=>{
    const picked=viewer.scene.pick(m.position);
    if(picked?.id?.gizmoAxis&&selectedModel){draggingAxis=picked.id.gizmoAxis;dragStart=m.position;dragStartMatrix=Cesium.Matrix4.clone(selectedModel.primitive.modelMatrix,new Cesium.Matrix4());viewer.scene.screenSpaceCameraController.enableInputs=false;return;}
  },Cesium.ScreenSpaceEventType.LEFT_DOWN);
  h.setInputAction(m=>{
    if(!draggingAxis)return;const delta=draggingAxis==='Z'?(dragStart.y-m.endPosition.y):(m.endPosition.x-dragStart.x);translateSelected(draggingAxis,delta);
  },Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  h.setInputAction(()=>{if(draggingAxis){draggingAxis=null;viewer.scene.screenSpaceCameraController.enableInputs=true;showGizmo();}},Cesium.ScreenSpaceEventType.LEFT_UP);
  h.setInputAction(click=>{
    const picked=viewer.scene.pick(click.position);
    const note=annotations.find(x=>x.entity===picked?.id);if(note){showNote(note);return;}
    if(!coordinateMode&&!measureMode&&!pinMode)return;
    const p=getPosition(click.position,pinMode);if(!p){if(pinMode)u.annotationInfo.textContent='点または3Dオブジェクト上を選択してください';return;}
    if(coordinateMode){const c=Cesium.Cartographic.fromCartesian(p);u.coordinateResult.innerHTML=`経度: ${Cesium.Math.toDegrees(c.longitude).toFixed(7)}°<br>緯度: ${Cesium.Math.toDegrees(c.latitude).toFixed(7)}°<br>標高: ${c.height.toFixed(2)} m`;return;}
    if(measureMode){const q=Cesium.Cartesian3.clone(p);measurePoints.push(q);measurePoint(q,measurePoints.length===1);if(measurePoints.length===2){finishMeasure(measurePoints[0],measurePoints[1]);measurePoints=[];}return;}
    currentPosition=Cesium.Cartesian3.clone(p);editingAnnotation=null;u.popup.style.display='block';
  },Cesium.ScreenSpaceEventType.LEFT_CLICK);

  u.save.onclick=()=>{const title=u.title.value.trim()||'注記',memo=u.memo.value.trim(),url=u.url.value.trim(),file=u.image.files[0];if(editingAnnotation){editingAnnotation.title=title;editingAnnotation.memo=memo;editingAnnotation.url=url;editingAnnotation.entity.label.text=title;if(file){if(editingAnnotation.imageUrl)URL.revokeObjectURL(editingAnnotation.imageUrl);editingAnnotation.imageUrl=URL.createObjectURL(file);}closePopups();return;}if(!currentPosition)return;const entity=viewer.entities.add({position:currentPosition,point:{pixelSize:16,color:Cesium.Color.RED,outlineColor:Cesium.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY},label:{text:title,pixelOffset:new Cesium.Cartesian2(0,-25),disableDepthTestDistance:Number.POSITIVE_INFINITY}});annotations.push({entity,position:Cesium.Cartesian3.clone(currentPosition),title,memo,url,imageUrl:file?URL.createObjectURL(file):''});closePopups();};
  u.cancel.onclick=closePopups;u.close.onclick=closePopups;
  u.edit.onclick=()=>{if(!selectedAnnotation)return;editingAnnotation=selectedAnnotation;currentPosition=Cesium.Cartesian3.clone(selectedAnnotation.position);u.title.value=selectedAnnotation.title;u.memo.value=selectedAnnotation.memo;u.url.value=selectedAnnotation.url;u.infoPopup.style.display='none';u.popup.style.display='block';};
  u.del.onclick=()=>{if(!selectedAnnotation||!confirm('この注記を削除しますか？'))return;viewer.entities.remove(selectedAnnotation.entity);annotations=annotations.filter(x=>x!==selectedAnnotation);closePopups();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){draggingAxis=null;if(viewer)viewer.scene.screenSpaceCameraController.enableInputs=true;closePopups();}});
  viewer.scene.postRender.addEventListener(()=>{if(selectedModel&&!draggingAxis)showGizmo();});
}

(async function init(){
  try{const terrain=await Cesium.CesiumTerrainProvider.fromIonAssetId(TERRAIN_ID);viewer=new Cesium.Viewer('cesiumContainer',{terrainProvider:terrain,animation:false,timeline:false,sceneModePicker:false,navigationHelpButton:false,fullscreenButton:false});viewer.scene.globe.depthTestAgainstTerrain=true;bind();await loadMain();}
  catch(e){console.error(e);alert('初期化に失敗しました。トークンとTerrainの権限を確認してください。');}
})();
