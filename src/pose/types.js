/** Canonical schema and validation live in state.js. Distances are meters,
 * quaternions [x,y,z,w], pose rotations are VRM-normalized rest-relative values.
 * The persisted project is plain JSON. No Three.js objects enter transactions. */
export const PROJECT_FORMAT_VERSION=1;
