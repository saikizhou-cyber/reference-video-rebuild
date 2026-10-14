import {makeHtmlInCanvasPresentation, type HtmlInCanvasShader} from '@remotion/transitions';

/**
 * Runs a gl-transitions style GLSL body as a @remotion/transitions presentation, so a shader
 * transition works between ANY two React scenes in a <TransitionSeries> (the scenes are captured with
 * Remotion's HTML-in-canvas; rendering needs Chrome 149+, which Remotion 4.0.5xx ships and enables).
 *
 * The body uses the gl-transitions conventions (https://gl-transitions.com):
 *   vec4 transition(vec2 uv)   uv in 0..1, y UP
 *   getFromColor(uv) / getToColor(uv), float progress (0 = from, 1 = to), float ratio (width / height)
 *   extra uniforms declared in the body, e.g. `uniform float amplitude;`
 */
export type UniformValue = number | boolean | readonly [number, number] | readonly [number, number, number] | readonly [number, number, number, number];

const VERTEX = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
	v_uv = vec2(a_pos.x * 0.5 + 0.5, a_pos.y * 0.5 + 0.5);
	gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const fragment = (body: string) => `#version 300 es
precision highp float;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float progress;
uniform float ratio;
in vec2 v_uv;
out vec4 outColor;
// element images are uploaded top row first: flip so uv.y points up as in gl-transitions
vec4 getFromColor(vec2 uv) { return texture(u_from, vec2(uv.x, 1.0 - uv.y)); }
vec4 getToColor(vec2 uv) { return texture(u_to, vec2(uv.x, 1.0 - uv.y)); }
${body}
void main() { outColor = transition(v_uv); }`;

const compile = (gl: WebGL2RenderingContext, src: string, type: number) => {
	const s = gl.createShader(type);
	if (!s) {
		throw new Error('createShader failed');
	}
	gl.shaderSource(s, src);
	gl.compileShader(s);
	if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(s);
		gl.deleteShader(s);
		throw new Error(`GLSL compile error: ${log}`);
	}
	return s;
};

const texture = (gl: WebGL2RenderingContext) => {
	const t = gl.createTexture();
	if (!t) {
		throw new Error('createTexture failed');
	}
	gl.bindTexture(gl.TEXTURE_2D, t);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
	return t;
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

/**
 * Build a presentation factory from a gl-transitions style body.
 * `defaults` lists every extra uniform with its default; props passed to the factory override them.
 */
export const makeGlTransition = <P extends Record<string, UniformValue>>(body: string, defaults: P) => {
	const shader: HtmlInCanvasShader<Partial<P>> = (canvas) => {
		const gl = canvas.getContext('webgl2', {premultipliedAlpha: true});
		if (!gl) {
			throw new Error('WebGL2 is not available');
		}
		const program = gl.createProgram();
		if (!program) {
			throw new Error('createProgram failed');
		}
		gl.attachShader(program, compile(gl, VERTEX, gl.VERTEX_SHADER));
		gl.attachShader(program, compile(gl, fragment(body), gl.FRAGMENT_SHADER));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(`GLSL link error: ${gl.getProgramInfoLog(program)}`);
		}
		const fromTex = texture(gl);
		const toTex = texture(gl);
		const vao = gl.createVertexArray();
		gl.bindVertexArray(vao);
		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		const aPos = gl.getAttribLocation(program, 'a_pos');
		gl.enableVertexAttribArray(aPos);
		gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
		const loc = (name: string) => gl.getUniformLocation(program, name);
		const uFrom = loc('u_from');
		const uTo = loc('u_to');
		const uProgress = loc('progress');
		const uRatio = loc('ratio');
		const extra = Object.keys(defaults).map((k) => [k, loc(k)] as const);

		return {
			clear: () => {
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);
			},
			cleanup: () => {
				gl.deleteProgram(program);
				gl.deleteTexture(fromTex);
				gl.deleteTexture(toTex);
			},
			// Remotion binds prevImage = the INCOMING scene and nextImage = the OUTGOING one, time 0..1.
			draw: ({prevImage, nextImage, width, height, time, passedProps}) => {
				if (!prevImage && !nextImage) {
					return;
				}
				if ((prevImage && (!prevImage.width || !prevImage.height)) || (nextImage && (!nextImage.width || !nextImage.height))) {
					return;
				}
				const p = !prevImage ? 0 : !nextImage ? 1 : time;
				gl.viewport(0, 0, width, height);
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);
				gl.useProgram(program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, fromTex);
				if (nextImage) {
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, nextImage);
				}
				gl.uniform1i(uFrom, 0);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, toTex);
				if (prevImage) {
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, prevImage);
				}
				gl.uniform1i(uTo, 1);
				gl.uniform1f(uProgress, p);
				gl.uniform1f(uRatio, width / height);
				for (const [k, l] of extra) {
					if (l) {
						const v = (passedProps as Partial<P>)[k] ?? defaults[k];
						setUniform(gl, l, v as UniformValue);
					}
				}
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			},
		};
	};
	return makeHtmlInCanvasPresentation<Partial<P>>(shader);
};
