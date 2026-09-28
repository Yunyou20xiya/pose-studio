import {makeCommand} from '../pose/state.js';
import {lightingDefaults,lightingIssues,lightTarget} from './settings.js';

export const lightPresets=[
 {id:'soft-front',name:'柔和正侧光',description:'主光稍高，暗面保留细节',offset:[-2,1.6,3],keyIntensity:3,fillIntensity:1.1,keyColor:'#fff6e5',shadowSoftness:.65},
 {id:'side',name:'冷调侧光',description:'侧面明暗更分明',offset:[-3,.8,1],keyIntensity:3.5,fillIntensity:.45,keyColor:'#d6e6ff',shadowSoftness:.2},
 {id:'back',name:'暖调逆光',description:'从后方勾出轮廓',offset:[2,1.3,-3],keyIntensity:4,fillIntensity:.65,keyColor:'#ffd3a3',shadowSoftness:.45},
 {id:'softbox',name:'方形柔光箱',description:'大面积发光，保留柔和的遮挡',offset:[-1.3,.9,2],keyIntensity:4,fillIntensity:.5,keyColor:'#fff6e5',shadowSoftness:.65,shape:{emitterShape:'square',emitterWidth:.9}},
 {id:'round-soft',name:'圆形柔光灯',description:'圆形发光面，宽幅照明',offset:[1,.6,1.8],keyIntensity:4,fillIntensity:.5,keyColor:'#ffffff',shadowSoftness:.6,shape:{emitterShape:'disc',emitterWidth:.7}},
 {id:'round-spot',name:'圆形聚光',description:'较清晰的圆形光斑',offset:[-.6,.5,2.4],keyIntensity:4,fillIntensity:.3,keyColor:'#fff6e5',shadowSoftness:.2,shape:{beamShape:'circle',beamWidth:1.1,beamEdge:.12}},
 {id:'window',name:'方形窗光',description:'倾斜的方形光斑，可继续拉成长条',offset:[-1,.6,2.5],keyIntensity:4,fillIntensity:.3,keyColor:'#ffffff',shadowSoftness:.15,shape:{beamShape:'square',beamWidth:1.1,beamRotation:20,beamEdge:.05}},
];
export function presetLighting(id,project,profile){
 const preset=lightPresets.find(p=>p.id===id);if(!preset)throw Error('没有这个布光方案');
 const lighting={...lightingDefaults(project.lighting),emitterShape:'point',beamShape:'none',beamRotation:0,beamEdge:.15,...preset.shape,keyTargetMode:'upperBody',keyEnabled:true,fillEnabled:true,keyIntensity:preset.keyIntensity,fillIntensity:preset.fillIntensity,keyColor:preset.keyColor,fillColor:'#ffffff',shadowSoftness:preset.shadowSoftness};
 const target=lightTarget({...project,lighting},profile);lighting.keyTarget=target;lighting.keyPosition=target.map((n,i)=>n+preset.offset[i]);return lighting;
}
export function buildLightingCommand(project,saved){
 const errors=lightingIssues(saved);if(errors.length)throw Error(errors.join('；'));
 const lighting={...lightingDefaults(saved),background:project.lighting.background,materialMode:project.lighting.materialMode||'original'};
 return makeCommand(project,[{kind:'patch',value:{lighting}}],{bones:[],expressions:[],root:false,gaze:false,stage:false,camera:false,lighting:true},'preset',[]);
}
