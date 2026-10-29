class_name IslaWorldMap
extends RefCounted

const MAP_PATH := "res://data/world_map.bin"
var size: int = 12288
var n: int = 768
var cell: float = 16.0
var half: float = 6144.0
var heights := PackedFloat32Array()
var biomes := PackedByteArray()
var provinces := PackedByteArray()
var seas := PackedByteArray()
var coast_distance := PackedFloat32Array()
var biome_noise: IslaSimplexNoise
var noise_a: IslaSimplexNoise
var noise_b: IslaSimplexNoise
var noise_c: IslaSimplexNoise

func _init() -> void:
	biome_noise = IslaSimplexNoise.new(1354)
	noise_a = IslaSimplexNoise.new(1354)
	noise_b = IslaSimplexNoise.new(1390)
	noise_c = IslaSimplexNoise.new(1428)
	_load_map()

func _load_map() -> void:
	if not FileAccess.file_exists(MAP_PATH):
		push_error("No se encuentra el mapa original importado: " + MAP_PATH)
		return
	var bytes := FileAccess.get_file_as_bytes(MAP_PATH)
	if bytes.size() < 16 or bytes.slice(0, 4).get_string_from_ascii() != "IPWM":
		push_error("El archivo del mapa original no tiene un encabezado válido.")
		return
	var version := bytes.decode_u32(4)
	if version != 1:
		push_error("Versión de mapa no compatible: %d" % version)
		return
	n = int(bytes.decode_u32(8))
	size = int(bytes.decode_u32(12))
	half = float(size) * 0.5
	cell = float(size) / float(n)
	var count := n * n
	heights.resize(count)
	biomes.resize(count)
	provinces.resize(count)
	seas.resize(count)
	coast_distance.resize(count)
	var p := 16
	for i in range(count):
		heights[i] = bytes.decode_float(p)
		biomes[i] = bytes[p + 4]
		provinces[i] = bytes[p + 5]
		seas[i] = bytes[p + 6]
		coast_distance[i] = bytes.decode_float(p + 7)
		p += 16

func _smooth(a: float, b: float, value: float) -> float:
	var t := clampf((value - a) / (b - a), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)

func _h(x_index: int, z_index: int) -> float:
	var ix := clampi(x_index, 0, n - 1)
	var iz := clampi(z_index, 0, n - 1)
	return heights[iz * n + ix]

func macro_height(x: float, z: float) -> float:
	if heights.is_empty():
		return -100.0
	var fx := (x + half) / cell - 0.5
	var fz := (z + half) / cell - 0.5
	var ix := floori(fx)
	var iz := floori(fz)
	var tx := fx - float(ix)
	var tz := fz - float(iz)
	var tx2 := tx * tx
	var tx3 := tx2 * tx
	var tz2 := tz * tz
	var tz3 := tz2 * tz
	var ax := [-0.5 * tx3 + tx2 - 0.5 * tx, 1.5 * tx3 - 2.5 * tx2 + 1.0, -1.5 * tx3 + 2.0 * tx2 + 0.5 * tx, 0.5 * tx3 - 0.5 * tx2]
	var az := [-0.5 * tz3 + tz2 - 0.5 * tz, 1.5 * tz3 - 2.5 * tz2 + 1.0, -1.5 * tz3 + 2.0 * tz2 + 0.5 * tz, 0.5 * tz3 - 0.5 * tz2]
	var row_values := PackedFloat32Array()
	row_values.resize(4)
	for r in range(4):
		var z_row := clampi(iz - 1 + r, 0, n - 1)
		var x0 := clampi(ix - 1, 0, n - 1)
		var x1 := clampi(ix, 0, n - 1)
		var x2 := clampi(ix + 1, 0, n - 1)
		var x3 := clampi(ix + 2, 0, n - 1)
		row_values[r] = _h(x0, z_row) * ax[0] + _h(x1, z_row) * ax[1] + _h(x2, z_row) * ax[2] + _h(x3, z_row) * ax[3]
	return row_values[0] * az[0] + row_values[1] * az[1] + row_values[2] * az[2] + row_values[3] * az[3]

func get_height(x: float, z: float) -> float:
	var hm := macro_height(x, z)
	if hm < 0.35:
		var f := _smooth(-0.2, -3.0, hm) * _smooth(-80.0, -6.0, hm)
		return hm + f * noise_a.noise2d(x * 0.03, z * 0.03) * 0.35
	var t := _smooth(0.35, 7.0, hm)
	var amplitude := 0.7 + minf(11.0, hm * 0.045)
	var detail := (noise_a.fbm(x * 0.0125, z * 0.0125, 3) * 1.6 + noise_b.noise2d(x * 0.055, z * 0.055) * 0.42 + noise_c.noise2d(x * 0.21, z * 0.21) * 0.1) * amplitude * t
	if hm > 70.0:
		detail += (noise_b.ridged(x * 0.011, z * 0.011, 3) - 0.35) * _smooth(70.0, 220.0, hm) * 14.0
	return hm + detail

func get_normal(x: float, z: float) -> Vector3:
	var e := 1.0
	return Vector3(get_height(x - e, z) - get_height(x + e, z), 2.0 * e, get_height(x, z - e) - get_height(x, z + e)).normalized()

func _cell_index(x: float, z: float) -> int:
	var ix := clampi(floori((x + half) / cell), 0, n - 1)
	var iz := clampi(floori((z + half) / cell), 0, n - 1)
	return iz * n + ix

func get_biome_id(x: float, z: float) -> int:
	return biomes[_cell_index(x, z)] if not biomes.is_empty() else 0

func get_province_index(x: float, z: float) -> int:
	return provinces[_cell_index(x, z)] if not provinces.is_empty() else 255

func get_sea_index(x: float, z: float) -> int:
	return seas[_cell_index(x, z)] if not seas.is_empty() else 255

func is_water(x: float, z: float) -> bool:
	return get_height(x, z) <= 0.0
