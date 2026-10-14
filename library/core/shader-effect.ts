import {createEffect} from 'remotion';
import type {UniformValue} from './gl-transition';

/**
 * Turns a GLSL body into a Remotion effect (remotion's public createEffect API), usable on ANY scene:
 *
 *   <Filter effects={[halftone({size: 8})]}>{scene}</Filter>        (core/filter.tsx, uses <HtmlInCanvas>)
 *   <Img src={...} effects={[grain({seed: frame})]} />
 *   presentations made with makeHtmlInCanvasPresentation also take `effects`
 *
 * The body defines `vec4 effect(vec2 uv)` (uv 0..1, y UP) and may use:
 *   getColor(uv)        the input image (premultiplied alpha, as the browser gives it)
 *   resolution          vec2, output size in px
 *   any uniform it declares, e.g. `uniform float amount;` (pass values as params; defaults below)
 * Effects are pure functions of their params: pass `time` / `seed` from useCurrentFrame() to animate.
 */
const VERTEX = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
	v_uv = a_pos * 0.5 + 0.5;
	gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const fragment = (body: string) => `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 resolution;
in vec2 v_uv;
out vec4 outColor;
vec4 getColor(vec2 uv) { return texture(u_src, uv); }
${body}
void main() { outColor = effect(v_uv); }`;

type GlState = {
	gl: WebGL2RenderingContext;
	program: WebGLProgram;
	tex: WebGLTexture;
	uSrc: WebGLUniformLocation | null;
	uRes: WebGLUniformLocation | null;
	locs: Map<string, WebGLUniformLocation | null>;
};

const compile = (gl: WebGL2RenderingContext, src: string, type: number, label: string) => {
	const s = gl.createShader(type);
	if (!s) {
		throw new Error(`${label}: createShader failed`);
	}
	gl.shaderSource(s, src);
	gl.compileShader(s);
	if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
		throw new Error(`${label}: GLSL compile error: ${gl.getShaderInfoLog(s)}`);
	}
	return s;
};

const setUniform = (gl: WebGL2RenderingContext, loc: WebGLUniformLocation, v: UniformValue) => {
	if (typeof v === 'boolean') {
		gl.uniform1i(loc, v ? 1 : 0);
	} else if (typeof v === 'number') {
		gl.uniform1f(loc, v);
	} else if (v.length === 2) {
		gl.uniform2f(loc, v[0], v[1]);
	} else if (v.length === 3) {
		gl.uniform3f(loc, v[0], v[1], v[2]);
	} else {
		gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
	}
};

export const makeShaderEffect = <P extends Record<string, UniformValue>>(opts: {
	/** unique, kebab-case, e.g. 's17-halftone' */
	type: string;
	label: string;
	body: string;
	defaults: P;
}) =>
	createEffect<Partial<P>, GlState>({
		type: opts.type,
		label: opts.label,
		documentationLink: null,
		backend: 'webgl2',
		calculateKey: (params) => `${opts.type}:${JSON.stringify(params)}`,
		schema: {},
		validateParams: () => undefined,
		setup: (target) => {
			const gl = target.getContext('webgl2', {premultipliedAlpha: true});
			if (!gl) {
				throw new Error(`${opts.label}: WebGL2 is not available`);
			}
			const program = gl.createProgram();
			if (!program) {
				throw new Error(`${opts.label}: createProgram failed`);
			}
			gl.attachShader(program, compile(gl, VERTEX, gl.VERTEX_SHADER, opts.label));
			gl.attachShader(program, compile(gl, fragment(opts.body), gl.FRAGMENT_SHADER, opts.label));
			gl.linkProgram(program);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
				throw new Error(`${opts.label}: GLSL link error: ${gl.getProgramInfoLog(program)}`);
			}
			const vao = gl.createVertexArray();
			gl.bindVertexArray(vao);
			const buf = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, buf);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
			const aPos = gl.getAttribLocation(program, 'a_pos');
			gl.enableVertexAttribArray(aPos);
			gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
			const tex = gl.createTexture();
			if (!tex) {
				throw new Error(`${opts.label}: createTexture failed`);
			}
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			const locs = new Map(Object.keys(opts.defaults).map((k) => [k, gl.getUniformLocation(program, k)] as const));
			return {gl, program, tex, uSrc: gl.getUniformLocation(program, 'u_src'), uRes: gl.getUniformLocation(program, 'resolution'), locs};
		},
		apply: ({source, state, params, width, height, flipSourceY}) => {
			const {gl, program, tex, uSrc, uRes, locs} = state;
			gl.viewport(0, 0, width, height);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.useProgram(program);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipSourceY);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
			gl.uniform1i(uSrc, 0);
			gl.uniform2f(uRes, width, height);
			for (const [k, loc] of locs) {
				if (loc) {
					setUniform(gl, loc, ((params as Partial<P>)[k] ?? opts.defaults[k]) as UniformValue);
				}
			}
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		},
		cleanup: ({gl, program, tex}) => {
			gl.deleteProgram(program);
			gl.deleteTexture(tex);
		},
	});
