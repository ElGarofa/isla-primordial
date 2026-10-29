class_name IslaSimplexNoise
extends RefCounted

const F2 := 0.3660254037844386
const G2 := 0.21132486540518713
const GRADIENTS: Array[Vector2] = [
	Vector2(1, 1), Vector2(-1, 1), Vector2(1, -1), Vector2(-1, -1),
	Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1),
]
var permutation: PackedInt32Array
var permutation_mod8: PackedInt32Array
var state: int

func _init(seed: int = 1) -> void:
	state = seed & 0xffffffff
	var p := PackedInt32Array()
	p.resize(256)
	for i in range(256):
		p[i] = i
	for i in range(255, 0, -1):
		var j := int(_random() * float(i + 1))
		var tmp := p[i]
		p[i] = p[j]
		p[j] = tmp
	permutation.resize(512)
	permutation_mod8.resize(512)
	for i in range(512):
		permutation[i] = p[i & 255]
		permutation_mod8[i] = permutation[i] & 7

func _random() -> float:
	state = (state + 0x6d2b79f5) & 0xffffffff
	var t := state
	t = (((t ^ (t >> 15)) * (1 | t)) & 0xffffffff)
	t = (((t ^ (t >> 7)) * (61 | t)) ^ t) & 0xffffffff
	t = (t ^ (t >> 14)) & 0xffffffff
	return float(t) / 4294967296.0

func noise2d(x_in: float, y_in: float) -> float:
	var skew := (x_in + y_in) * F2
	var i := floori(x_in + skew)
	var j := floori(y_in + skew)
	var unskew := float(i + j) * G2
	var x0 := x_in - (float(i) - unskew)
	var y0 := y_in - (float(j) - unskew)
	var i1 := 1 if x0 > y0 else 0
	var j1 := 0 if x0 > y0 else 1
	var x1 := x0 - float(i1) + G2
	var y1 := y0 - float(j1) + G2
	var x2 := x0 - 1.0 + 2.0 * G2
	var y2 := y0 - 1.0 + 2.0 * G2
	var ii := posmod(i, 256)
	var jj := posmod(j, 256)
	var n0 := _corner(x0, y0, permutation_mod8[ii + permutation[jj]])
	var n1 := _corner(x1, y1, permutation_mod8[ii + i1 + permutation[jj + j1]])
	var n2 := _corner(x2, y2, permutation_mod8[ii + 1 + permutation[jj + 1]])
	return 70.0 * (n0 + n1 + n2)

func _corner(x: float, y: float, gradient_index: int) -> float:
	var t := 0.5 - x * x - y * y
	if t <= 0.0:
		return 0.0
	t *= t
	return t * t * GRADIENTS[gradient_index].dot(Vector2(x, y))

func fbm(x: float, y: float, octaves: int = 5, lacunarity: float = 2.0, gain: float = 0.5) -> float:
	var amplitude := 1.0
	var frequency := 1.0
	var total := 0.0
	var norm := 0.0
	for _octave in range(octaves):
		total += amplitude * noise2d(x * frequency, y * frequency)
		norm += amplitude
		amplitude *= gain
		frequency *= lacunarity
	return total / maxf(0.00001, norm)

func ridged(x: float, y: float, octaves: int = 5, lacunarity: float = 2.0, gain: float = 0.5) -> float:
	var amplitude := 1.0
	var frequency := 1.0
	var total := 0.0
	var norm := 0.0
	for _octave in range(octaves):
		var ridge := 1.0 - absf(noise2d(x * frequency, y * frequency))
		total += amplitude * ridge * ridge
		norm += amplitude
		amplitude *= gain
		frequency *= lacunarity
	return total / maxf(0.00001, norm)
