import {toWorld,primaryDescriptor} from '../scene/state.js';
import {worldPoint} from '../pose/kinematics.js';

const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=1000);
const color=v=>typeof v==='string'&&/^#[\da-f]{6}$/i.test(v);
export function lightingDefaults(lighting){
 return structuredClone({keyEnabled:true,fillEnabled:true,keyTargetMode:'point',keyTarget:[0,0,0],keyColor:'#fff6e5',fillColor:'#ffffff',shadowSoftness:0,materialMode:'original',emitterShape:'point',emitterWidth:.6,emitterHeight:.3,beamShape:'none',beamWidth:1.5,beamHeight:.6,beamRotation:0,beamEdge:.15,...lighting});
}
export function lightingIssues(light){
 if(!light||typeof light!=='object'||Array.isArray(light))return['照明无效'];
 const issues=[];
 if(!vector(light.keyPosition)||!['keyIntensity','fillIntensity'].every(k=>Number.isFinite(light[k])&&light[k]>=0&&light[k]<=30)||!color(light.background))issues.push('灯位、亮度或背景颜色无效');
 for(const name of ['keyEnabled','fillEnabled'])if(light[name]!==undefined&&typeof light[name]!=='boolean')issues.push('灯光开关无效');
 for(const name of ['keyColor','fillColor'])if(light[name]!==undefined&&!color(light[name]))issues.push('灯光颜色无效');
 if(light.keyTargetMode!==undefined&&!['point','head','upperBody'].includes(light.keyTargetMode))issues.push('照射目标类型无效');
 if(light.keyTarget!==undefined&&!vector(light.keyTarget))issues.push('照射目标位置无效');
 if(light.shadowSoftness!==undefined&&(!Number.isFinite(light.shadowSoftness)||light.shadowSoftness<0||light.shadowSoftness>1))issues.push('阴影边缘设置无效');
 if(light.materialMode!==undefined&&!['original','reference'].includes(light.materialMode))issues.push('受光显示方式无效');
 if(light.emitterShape!==undefined&&!['point','square','rectangle','disc'].includes(light.emitterShape))issues.push('灯具形状无效');
 if(light.beamShape!==undefined&&!['none','circle','square','rectangle'].includes(light.beamShape))issues.push('光斑形状无效');
 for(const name of ['emitterWidth','emitterHeight','beamWidth','beamHeight'])if(light[name]!==undefined&&(!Number.isFinite(light[name])||light[name]<.05||light[name]>8))issues.push('灯具或光斑尺寸应在 0.05—8 米之间');
 if(light.beamRotation!==undefined&&(!Number.isFinite(light.beamRotation)||Math.abs(light.beamRotation)>180))issues.push('光斑旋转角度无效');
 if(light.beamEdge!==undefined&&(!Number.isFinite(light.beamEdge)||light.beamEdge<0||light.beamEdge>1))issues.push('光斑边缘设置无效');
 const l=lightingDefaults(light);
 if(!issues.length&&l.keyEnabled&&l.keyTargetMode==='point'&&Math.hypot(...l.keyPosition.map((n,i)=>n-l.keyTarget[i]))<.05)issues.push('主光与照射点太近，请拉开一点');
 return issues;
}
export function lightTarget(project,profile){
 if(project._sceneProject)project={...project._sceneProject,lighting:project.lighting};
 const l=lightingDefaults(project.lighting);
 if(l.keyTargetMode==='head'&&profile?.bones.head)return toWorld(project,primaryDescriptor(project).id,worldPoint(project,profile,'head',[0,.035,-.06]));
 if(l.keyTargetMode==='upperBody'&&profile){const bone=['upperChest','chest','spine'].find(n=>profile.bones[n]);if(bone)return toWorld(project,primaryDescriptor(project).id,worldPoint(project,profile,bone,[0,.04,0]));}
 return [...l.keyTarget];
}
