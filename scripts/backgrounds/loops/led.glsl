// LED wall patterns. C0 background, C1..C3 light colours. Q.y mode: 0 tunnel, 1 floor grid, 2 bars, 3 hexagons,
// 4 dot matrix, 5 diagonal stripes, 6 rings, 7 kaleidoscope. P: density, line width, brightness.
vec3 ramp(float t) {
    t = fract(t) * 3.;
    return t < 1. ? mix(lin(C[1]), lin(C[2]), t) : (t < 2. ? mix(lin(C[2]), lin(C[3]), t - 1.) : mix(lin(C[3]), lin(C[1]), t - 2.));
}
vec3 scene(vec2 uv, vec2 p) {
    vec3 col = lin(C[0]);
    float mode = Q.y;
    if (mode < .5) {
        float r = max(abs(p.x) * .85, abs(p.y) * 1.5);
        float z = log(r + 1e-4) * P.x - T * 3.;
        float f = fract(z);
        float line = exp(-abs(f - .5) * P.y) ;
        col += ramp(floor(z) / 3.) * line * P.z * smoothstep(0., .15, r);
        return col + lin(C[1]) * exp(-r * 8.) * .2;
    }
    if (mode < 1.5) {
        float hz = .02;
        if (p.y < hz) {
            float z = .35 / (hz - p.y);
            float x = p.x * z;
            float gx = abs(fract(x * P.x * .5) - .5) / fwidth(x * P.x * .5);
            float gz = abs(fract(z * .5 + T * 2.) - .5) / fwidth(z * .5);
            float g = 1. - min(min(gx, gz) / P.y, 1.);
            col += mix(lin(C[1]), lin(C[2]), sat(p.x + .5)) * g * P.z * exp(-z * .08);
        }
        col += lin(C[3]) * exp(-abs(p.y - hz) * 9.) * .6;
        return col;
    }
    if (mode < 2.5) {
        float x = p.x * P.x;
        float idx = floor(x);
        float b = pow(.5 + .5 * sin(PH * 2. + idx * 1.7), 6.) + .5 * pow(.5 + .5 * sin(PH - idx * .9), 10.);
        float gap = smoothstep(.5, .5 - .08 * P.y, abs(fract(x) - .5));
        float v = .6 + .4 * sin(p.y * 3. + idx);
        return col + ramp(idx * .13 + T) * b * gap * v * P.z;
    }
    if (mode < 3.5) {
        vec2 q = p * P.x;
        vec2 rr = vec2(1., 1.732);
        vec2 h = rr * .5;
        vec2 a = mod(q, rr) - h;
        vec2 b = mod(q - h, rr) - h;
        vec2 g = dot(a, a) < dot(b, b) ? a : b;
        vec2 id = q - g;
        float e = .5 - max(dot(abs(g), vec2(.5, .866)), abs(g.x));
        float wave = pow(.5 + .5 * sin(length(id) * .9 - PH * 2.), 3.);
        col += ramp(length(id) * .05 - T) * (wave * .8 * smoothstep(.0, .06, e) + exp(-e * 40. * P.y) * .5) * P.z;
        return col;
    }
    if (mode < 4.5) {
        vec2 q = p * P.x;
        vec2 id = floor(q);
        float d = length(fract(q) - .5);
        float n = lfbm(id / P.x * 2.2, 2., 4) * .5 + .5;
        float b = smoothstep(.38, .68, n) * 1.6;
        return col + ramp(n + T) * b * (1. - smoothstep(.28, .36, d)) * P.z + lin(C[1]) * .03 * (1. - smoothstep(.28, .36, d));
    }
    if (mode < 5.5) {
        float x = (p.x + p.y) * P.x - T * 3.;
        float f = fract(x);
        float band = smoothstep(.0, .04 * P.y, f) * smoothstep(.5, .46, f);
        return col + ramp(floor(x) / 3.) * band * P.z * (.55 + .45 * sin(p.y * 2. - PH));
    }
    if (mode < 6.5) {
        float r = length(p);
        float x = r * P.x - T * 3.;
        float ring = exp(-abs(fract(x) - .5) * P.y);
        return col + ramp(floor(x) / 3.) * ring * P.z * exp(-r * .6);
    }
    float r = length(p);
    float a = atan(p.y, p.x);
    float seg = TAU / 8.;
    a = abs(mod(a, seg) - seg * .5);
    vec2 q = r * vec2(cos(a), sin(a)) * P.x;
    float n = lfbm(q, 2., 5) * .5 + .5;
    return col + ramp(n * 1.5 + r * .3) * (exp(-abs(fract(n * 7.) - .5) * 14.) * .9 + smoothstep(.5, .9, n) * .3) * P.z;
}
