#version 330 core
// Shared code for every Scriptural motion loop. T runs 0..1 over one loop and
// everything that moves is periodic in T, so the last frame meets the first.
uniform vec2 R;
uniform float T;
uniform vec3 C[6];
uniform vec4 P;
uniform vec4 Q;
uniform float SEED;
out vec4 fragColor;
#define TAU 6.283185307
#define PI 3.14159265
#define PH (T * TAU)

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
float sat(float x) { return clamp(x, 0., 1.); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031 + SEED * .0071); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973) + SEED * .0071); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(.1031, .1030, .0973) + SEED * .0071); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }

// Gradient noise whose lattice wraps by `per` on each axis where per > 0.
vec3 wrapc(vec3 i, vec3 per) {
    return vec3(per.x > 0. ? mod(i.x, per.x) : i.x, per.y > 0. ? mod(i.y, per.y) : i.y, per.z > 0. ? mod(i.z, per.z) : i.z);
}
vec3 grd(vec3 i, vec3 per) { return hash33(wrapc(i, per)) * 2. - 1.; }
float gnoise(vec3 p, vec3 per) {
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * f * (f * (f * 6. - 15.) + 10.);
    float a = dot(grd(i, per), f);
    float b = dot(grd(i + vec3(1, 0, 0), per), f - vec3(1, 0, 0));
    float c = dot(grd(i + vec3(0, 1, 0), per), f - vec3(0, 1, 0));
    float d = dot(grd(i + vec3(1, 1, 0), per), f - vec3(1, 1, 0));
    float e = dot(grd(i + vec3(0, 0, 1), per), f - vec3(0, 0, 1));
    float g = dot(grd(i + vec3(1, 0, 1), per), f - vec3(1, 0, 1));
    float h = dot(grd(i + vec3(0, 1, 1), per), f - vec3(0, 1, 1));
    float k = dot(grd(i + vec3(1, 1, 1), per), f - vec3(1, 1, 1));
    return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
float fbm(vec3 p, vec3 per, int oct) {
    float s = 0., a = .5;
    for (int k = 0; k < 8; k++) {
        if (k >= oct) break;
        s += a * gnoise(p, per);
        p = p * 2. + vec3(13.7, 7.3, 0.);
        per *= 2.;
        a *= .5;
    }
    return s;
}
// 2D noise that evolves through `zper` lattice cells per loop and returns to its start.
float lfbm(vec2 p, float zper, int oct) { return fbm(vec3(p, T * zper), vec3(0., 0., zper), oct); }

float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
float sdSegment(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h); }
// Latin cross, half height 0.5 before scaling by s, centred on its middle.
float sdCross(vec2 p, float s) {
    p /= s;
    float v = sdBox(p, vec2(.042, .5));
    float h = sdBox(p - vec2(0., .2), vec2(.27, .042));
    return min(v, h) * s;
}
float fill(float d) { float w = fwidth(d); return 1. - smoothstep(-w, w, d); }
vec3 vgrad(vec2 uv, int top, int bottom) { return mix(lin(C[bottom]), lin(C[top]), uv.y); }
vec3 pick3(float h, int a) { return h < .333 ? lin(C[a]) : (h < .666 ? lin(C[a + 1]) : lin(C[a + 2])); }

// Light rays fanning out of `s`; `freq` sets how many.
float rays(vec2 p, vec2 s, float freq) {
    vec2 d = p - s;
    float a = atan(d.y, d.x);
    vec2 ang = vec2(cos(a), sin(a)) * freq;
    float n = fbm(vec3(ang, T * 2.), vec3(0., 0., 2.), 4) * .5 + .5;
    float m = fbm(vec3(ang * 2.3 + 5., T), vec3(0., 0., 1.), 3) * .5 + .5;
    return pow(sat(n * 1.25 - .12), 3.) * .8 + pow(sat(m), 4.) * .6;
}
// Drifting motes of dust lit near `s`.
vec3 dust(vec2 p, vec2 s, int n, vec3 tint, float amount) {
    vec3 col = vec3(0.);
    for (int i = 0; i < 220; i++) {
        if (i >= n) break;
        float fi = float(i);
        vec3 h = hash33(vec3(fi, 3.3, fi * .7));
        vec2 c = vec2((h.x - .5) * 1.9, (fract(h.y + T * (h.z > .5 ? 1. : -1.)) - .5) * 1.1);
        c.x += .02 * sin(PH + fi);
        float d = length(p - c);
        float sz = .0012 + .0028 * h.z;
        float lit = exp(-length(c - s) * 1.4);
        col += tint * exp(-d * d / (sz * sz)) * (.4 + .6 * h.z) * lit * (.6 + .4 * sin(PH * 2. + fi * 3.));
    }
    return col * amount;
}
