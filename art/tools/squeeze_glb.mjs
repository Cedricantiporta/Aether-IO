// Shrinks a GLB with EXT_meshopt_compression in FILTER mode (no quantization: every attribute decodes back to its
// original type, so code that reads position / normal arrays keeps working). drei useGLTF + creatureKit decode it.
// Setup (outside the repo): npm i @gltf-transform/core@4.1.1 @gltf-transform/extensions@4.1.1 meshoptimizer@0.22.0
// Usage: node art/tools/squeeze_glb.mjs in.glb out.glb   (re-run after a Blender script rebuilds a kit GLB)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const [inp, out] = process.argv.slice(2);
const doc = await io.read(inp);
// keep every attribute's type (float stays float after decoding): FILTER mode, no quantization
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(out, doc);
