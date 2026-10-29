class_name IslaMapView
extends Control

var island: IslaIslandWorld
var map_texture: ImageTexture
var map_image: Image
var map_size := 256

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if island != null:
		_build_map()

func configure(world: IslaIslandWorld) -> void:
	island = world

func _build_map() -> void:
	map_image = Image.create(map_size, map_size, false, Image.FORMAT_RGBA8)
	var colors: Dictionary = GameState.regions_data.get("biome_colors", {})
	var keys := IslaIslandWorld.BIOME_KEYS
	for py in range(map_size):
		var z := (float(py) / float(map_size - 1) - 0.5) * island.map_data.size
		for px in range(map_size):
			var x := (float(px) / float(map_size - 1) - 0.5) * island.map_data.size
			var biome_id := island.map_data.get_biome_id(x, z)
			var biome: String = keys[biome_id] if biome_id >= 0 and biome_id < keys.size() else "mar"
			var rgb: Array = colors.get(biome, [30, 90, 130])
			var color := Color(float(rgb[0]) / 255.0, float(rgb[1]) / 255.0, float(rgb[2]) / 255.0)
			var h := island.map_data.get_height(x, z)
			if h > 160.0:
				color = color.lerp(Color(0.92, 0.94, 0.95), 0.55)
			elif h < 0.0:
				color = color.darkened(0.18)
			map_image.set_pixel(px, py, color)
	map_texture = ImageTexture.create_from_image(map_image)
	queue_redraw()

func _draw() -> void:
	if map_texture == null or island == null or GameState.player_ref == null:
		return
	var rect := Rect2(Vector2.ZERO, size)
	draw_texture_rect(map_texture, rect, false)
	var p: Vector3 = GameState.player_ref.global_position
	var px := (p.x + island.map_data.half) / island.map_data.size * size.x
	var py := (p.z + island.map_data.half) / island.map_data.size * size.y
	draw_circle(Vector2(px, py), maxf(5.0, size.x * 0.018), Color(1.0, 0.82, 0.24))
	draw_circle(Vector2(px, py), maxf(8.0, size.x * 0.028), Color(1.0, 0.82, 0.24, 0.3), false, 2.0)

func refresh() -> void:
	queue_redraw()
