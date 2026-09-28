import {forward} from '../pose/kinematics.js';
// Merge only explicitly edited axes into the latest committed world position.
export function effectorFieldTarget(project,bone,edits,profile){
 const position=forward(project,profile)[bone].position.slice();for(const[key,value]of Object.entries(edits)){const axis=Number(key);if(![0,1,2].includes(axis)||!Number.isFinite(value))throw Error('控制点坐标无效');position[axis]=value;}return position;
}
