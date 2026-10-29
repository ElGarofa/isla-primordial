class_name IslaIslandWorld
extends Node3D

const MAP_SCRIPT := preload("res://scripts/world_map.gd")
const CHUNK_SIZE := 128.0
const CHUNK_STEPS := 32
const STREAM_RADIUS := 2
const SEA_SIZE := 28000.0
const SEA_LEVEL := 0.0
const BIOME_KEYS := ["mar", "playa", "pradera", "selva", "bosque", "pantano", "desierto", "montana", "nieve", "volcan", "taiga"]
const BIOME_TEXTURES := {
	"mar": "", "playa": "arena_a.jpg", "pradera": "hierba_a.jpg", "selva": "hierba_a.jpg",
	"bosque": "hojarasca_a.jpg", "pantano": "barro_a.jpg", "desierto": "desierto_a.jpg",
	"montana": "roca_a.jpg", "nieve": "nieve_a.jpg", "volcan": "ceniza_a.jpg", "taiga": "hojarasca_a.jpg",
}

var map_data: IslaWorldMap
var active_chunks: Dictionary = {}
var resource_nodes: Array[Dictionary] = []
var resource_lookup: Dictionary = {}
var world_root: Node3D
var fauna_root: Node3D
var player: CharacterBody3D
var terrain_materials: Dictionary = {}
var sun: DirectionalLight3D
var rain_particles: GPUParticles3D
var weather_timer: float = 130.0
var environment: WorldEnvironment
var water_material: ShaderMaterial
var nearest_target: Dictionary = {}
var nearest_creature: Node3D
var update_stream_time: float = 0.0
var seed := 1337
var spawn_point := Vector3(0, 3, 4000)
var placed_nodes: Array[Node3D] = []

func _ready() -> void:
	map_data = MAP_SCRIPT.new()
	_configure_scene()
	spawn_point = _find_spawn()
	GameState.player_ref = null
	GameState.island_ref = self
	world_root = Node3D.new()
	world_root.name = "Mundo"
	add_child(world_root)
	fauna_root = Node3D.new()
	fauna_root.name = "Fauna"
	add_child(fauna_root)
	_stream_chunks(true)
	_create_fauna()
	_restore_placed_objects()

func _configure_scene() -> void:
	var world_env := WorldEnvironment.new()
	world_env.name = "Environment"
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.15, 0.36, 0.56)
	sky_mat.sky_horizon_color = Color(0.66, 0.77, 0.79)
	sky_mat.ground_bottom_color = Color(0.08, 0.1, 0.09)
	sky_mat.ground_horizon_color = Color(0.45, 0.54, 0.49)
	sky.sky_material = sky_mat
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.75
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true
	env.fog_light_color = Color(0.62, 0.73, 0.72)
	env.fog_density = 0.0013
	world_env.environment = env
	environment = world_env
	add_child(world_env)
	sun = DirectionalLight3D.new()
	sun.name = "Sol"
	sun.rotation = Vector3(deg_to_rad(-52), deg_to_rad(-24), 0)
	sun.light_color = Color(1.0, 0.87, 0.68)
	sun.light_energy = 1.25
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 180.0
	add_child(sun)
	_add_water()
	_add_weather()
	_make_terrain_materials()

func _make_terrain_materials() -> void:
	for biome in BIOME_KEYS:
		var material := StandardMaterial3D.new()
		material.roughness = 0.95
		material.vertex_color_use_as_albedo = true
		var texture_file: String = BIOME_TEXTURES.get(biome, "hierba_a.jpg")
		if not texture_file.is_empty():
			var texture := load("res://assets/textures/suelo/" + texture_file)
			if texture is Texture2D:
				material.albedo_texture = texture
				var normal_path := "res://assets/textures/suelo/" + texture_file.replace("_a.jpg", "_n.jpg")
				if ResourceLoader.exists(normal_path):
					material.normal_texture = load(normal_path)
					material.normal_enabled = true
					material.normal_scale = 0.55
				material.uv1_scale = Vector3(0.22, 0.22, 1.0)
		terrain_materials[biome] = material

func _add_weather() -> void:
	rain_particles = GPUParticles3D.new()
	rain_particles.name = "Lluvia local"
	rain_particles.amount = 700
	rain_particles.lifetime = 1.5
	rain_particles.emitting = false
	rain_particles.visibility_aabb = AABB(Vector3(-35, -20, -35), Vector3(70, 45, 70))
	var rain_mesh := BoxMesh.new()
	rain_mesh.size = Vector3(0.018, 0.9, 0.018)
	rain_particles.draw_pass_1 = rain_mesh
	var particle_material := ParticleProcessMaterial.new()
	particle_material.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	particle_material.emission_box_extents = Vector3(35, 14, 35)
	particle_material.direction = Vector3(0.0, -1.0, 0.0)
	particle_material.spread = 3.0
	particle_material.initial_velocity_min = 14.0
	particle_material.initial_velocity_max = 18.0
	particle_material.gravity = Vector3(0.0, -8.0, 0.0)
	rain_particles.process_material = particle_material
	add_child(rain_particles)

func _add_water() -> void:
	var water := MeshInstance3D.new()
	water.name = "Océano"
	var plane := PlaneMesh.new()
	plane.size = Vector2(SEA_SIZE, SEA_SIZE)
	plane.subdivide_width = 96
	plane.subdivide_depth = 96
	water.mesh = plane
	water.position = Vector3(0, SEA_LEVEL, 0)
	var shader := Shader.new()
	shader.code = """
shader_type spatial;
render_mode cull_disabled, depth_prepass_alpha;
uniform vec4 shallow_color : source_color = vec4(0.08, 0.42, 0.48, 0.88);
uniform vec4 deep_color : source_color = vec4(0.025, 0.13, 0.23, 0.94);
void vertex() {
	float wave = sin(VERTEX.x * 0.018 + TIME * 0.8) * 0.09 + cos(VERTEX.z * 0.025 - TIME * 0.63) * 0.06;
	VERTEX.y += wave;
}
void fragment() {
	float bands = sin((UV.x + UV.y) * 800.0 + TIME * 0.35) * 0.5 + 0.5;
	ALBEDO = mix(deep_color.rgb, shallow_color.rgb, bands * 0.22 + 0.34);
	ROUGHNESS = 0.24;
	METALLIC = 0.08;
	ALPHA = mix(deep_color.a, shallow_color.a, bands);
}
"""
	water_material = ShaderMaterial.new()
	water_material.shader = shader
	water.material_override = water_material
	add_child(water)

func _process(delta: float) -> void:
	_update_time_of_day()
	_update_weather(delta)
	if rain_particles != null and player != null:
		rain_particles.global_position = player.global_position + Vector3(0, 12, 0)
	update_stream_time -= delta
	if update_stream_time <= 0.0:
		update_stream_time = 0.4
		_stream_chunks(false)
	_update_nearest_target()

func set_player(value: CharacterBody3D) -> void:
	player = value
	GameState.player_ref = value

func get_height(x: float, z: float) -> float:
	return map_data.get_height(x, z)

func get_spawn() -> Vector3:
	return spawn_point

func get_biome(x: float, z: float) -> String:
	var id := map_data.get_biome_id(x, z)
	return BIOME_KEYS[id] if id >= 0 and id < BIOME_KEYS.size() else "mar"

func get_province(x: float, z: float) -> String:
	var index := map_data.get_province_index(x, z)
	var provinces: Array = GameState.regions_data.get("provinces", [])
	return str(provinces[index].get("id", "")) if index >= 0 and index < provinces.size() else ""

func _find_spawn() -> Vector3:
	# Misma búsqueda determinista de playa que el código original de heightfield.js.
	for k in range(90):
		var x := (1.0 if k % 2 == 1 else -1.0) * float(ceili(float(k) / 2.0) * 60)
		for z in range(5400, 1499, -6):
			if map_data.get_height(x, float(z)) <= 1.4:
				continue
			for q in range(0, 160, 3):
				var zz := float(z - q)
				var h := map_data.get_height(x, zz)
				var slope := 1.0 - map_data.get_normal(x, zz).y
				if h > 1.5 and h < 3.2 and slope < 0.035 and map_data.get_province_index(x, zz) == 0:
					var inland := map_data.get_height(x, zz - 14.0)
					if inland > h - 0.05 and inland < 9.0:
						return Vector3(x, h + 0.2, zz)
	return Vector3(0, map_data.get_height(0, 2300) + 0.2, 2300)

func _update_weather(delta: float) -> void:
	if not GameState.game_active:
		return
	weather_timer -= delta
	if weather_timer <= 0.0:
		if GameState.weather == "lluvia":
			GameState.weather = "soleado"
			weather_timer = randf_range(180.0, 360.0)
			GameState.message("La lluvia ha pasado.")
		else:
			GameState.weather = "lluvia" if randf() < 0.35 else "soleado"
			weather_timer = randf_range(90.0, 200.0)
			if GameState.weather == "lluvia": GameState.message("Empieza a llover. Busca un techo o una fogata.")
	if rain_particles != null:
		rain_particles.emitting = GameState.weather == "lluvia"

func is_sheltered(position: Vector3) -> bool:
	for data in GameState.placed_objects:
		if str(data.get("item", "")) != "refugio_ramas":
			continue
		var p: Array = data.get("position", [0.0, 0.0, 0.0])
		if position.distance_to(Vector3(float(p[0]), float(p[1]) + 1.0, float(p[2]))) < 4.0:
			return true
	return false

func _update_time_of_day() -> void:
	var hour := GameState.hour_of_day()
	var elevation := sin((hour - 6.0) / 12.0 * PI)
	var daylight := clampf(elevation, 0.035, 1.0)
	sun.light_energy = 0.12 + daylight * 1.2
	sun.rotation.x = lerpf(deg_to_rad(8.0), deg_to_rad(-78.0), daylight)
	sun.rotation.y = fposmod((hour / 24.0) * TAU + PI, TAU)
	environment.environment.ambient_light_energy = 0.18 + daylight * 0.6
	var sky_mat := environment.environment.sky.sky_material as ProceduralSkyMaterial
	if sky_mat != null:
		sky_mat.sky_top_color = Color(0.025, 0.045, 0.11).lerp(Color(0.18, 0.43, 0.68), daylight)
		sky_mat.sky_horizon_color = Color(0.12, 0.16, 0.22).lerp(Color(0.72, 0.82, 0.78), daylight)

func _stream_chunks(force: bool) -> void:
	if world_root == null:
		return
	var center := Vector2i(floori(spawn_point.x / CHUNK_SIZE), floori(spawn_point.z / CHUNK_SIZE))
	if player != null:
		center = Vector2i(floori(player.global_position.x / CHUNK_SIZE), floori(player.global_position.z / CHUNK_SIZE))
	for z in range(center.y - STREAM_RADIUS, center.y + STREAM_RADIUS + 1):
		for x in range(center.x - STREAM_RADIUS, center.x + STREAM_RADIUS + 1):
			var coord := Vector2i(x, z)
			var key := _chunk_key(coord)
			if active_chunks.has(key):
				continue
			var world_x := float(x) * CHUNK_SIZE
			var world_z := float(z) * CHUNK_SIZE
			if absf(world_x) > map_data.half or absf(world_z) > map_data.half:
				continue
			_create_chunk(coord)
	var remove_keys: Array[String] = []
	for key in active_chunks.keys():
		var coord: Vector2i = active_chunks[key].coord
		if abs(coord.x - center.x) > STREAM_RADIUS + 1 or abs(coord.y - center.y) > STREAM_RADIUS + 1:
			remove_keys.append(key)
	for key in remove_keys:
		var entry: Dictionary = active_chunks[key]
		for id in entry.resource_ids:
			resource_lookup.erase(id)
			for resource in resource_nodes.duplicate():
				if str(resource.id) == str(id):
					resource_nodes.erase(resource)
		active_chunks.erase(key)
		if is_instance_valid(entry.root):
			entry.root.queue_free()

func _chunk_key(coord: Vector2i) -> String:
	return "%d:%d" % [coord.x, coord.y]

func _create_chunk(coord: Vector2i) -> void:
	var root := Node3D.new()
	root.name = "Terreno_%d_%d" % [coord.x, coord.y]
	root.position = Vector3(float(coord.x) * CHUNK_SIZE, 0, float(coord.y) * CHUNK_SIZE)
	world_root.add_child(root)
	var mesh := _make_chunk_mesh(root.position.x, root.position.z)
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.mesh = mesh
	mesh_instance.material_override = terrain_materials.get(_dominant_biome(root.position.x + CHUNK_SIZE * 0.5, root.position.z + CHUNK_SIZE * 0.5))
	mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	root.add_child(mesh_instance)
	var body := StaticBody3D.new()
	body.name = "Colisión terreno"
	var collider := CollisionShape3D.new()
	var terrain_shape := mesh.create_trimesh_shape()
	terrain_shape.backface_collision = true
	collider.shape = terrain_shape
	body.add_child(collider)
	root.add_child(body)
	var object_body := StaticBody3D.new()
	object_body.name = "Colisión recursos"
	root.add_child(object_body)
	var resource_ids: Array[String] = []
	_add_chunk_resources(coord, root, object_body, resource_ids)
	active_chunks[_chunk_key(coord)] = {"coord": coord, "root": root, "resource_ids": resource_ids}

func _dominant_biome(x: float, z: float) -> String:
	return get_biome(x, z)

func _biome_color(x: float, z: float) -> Color:
	var biome := get_biome(x, z)
	var colors: Dictionary = GameState.regions_data.get("biome_colors", {})
	var rgb: Array = colors.get(biome, [90, 125, 70])
	return Color(float(rgb[0]) / 255.0, float(rgb[1]) / 255.0, float(rgb[2]) / 255.0, 1.0)

func _make_chunk_mesh(origin_x: float, origin_z: float) -> ArrayMesh:
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var colors := PackedColorArray()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	var side := CHUNK_STEPS + 1
	var step := CHUNK_SIZE / float(CHUNK_STEPS)
	vertices.resize(side * side)
	normals.resize(side * side)
	colors.resize(side * side)
	uvs.resize(side * side)
	for z in range(side):
		for x in range(side):
			var index := z * side + x
			var world_x := origin_x + float(x) * step
			var world_z := origin_z + float(z) * step
			vertices[index] = Vector3(float(x) * step, map_data.get_height(world_x, world_z), float(z) * step)
			normals[index] = map_data.get_normal(world_x, world_z)
			var color := _biome_color(world_x, world_z)
			if normals[index].y < 0.75:
				color = color.lerp(Color(0.38, 0.36, 0.33), clampf(0.75 - normals[index].y, 0.0, 0.45))
			colors[index] = color
			uvs[index] = Vector2(world_x / 9.0, world_z / 9.0)
	indices.resize(CHUNK_STEPS * CHUNK_STEPS * 6)
	var cursor := 0
	for z in range(CHUNK_STEPS):
		for x in range(CHUNK_STEPS):
			var a := z * side + x
			var b := a + 1
			var c := a + side
			var d := c + 1
			indices[cursor] = a
			indices[cursor + 1] = c
			indices[cursor + 2] = b
			indices[cursor + 3] = b
			indices[cursor + 4] = c
			indices[cursor + 5] = d
			cursor += 6
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var result := ArrayMesh.new()
	result.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return result

func _add_chunk_resources(coord: Vector2i, root: Node3D, collision_body: StaticBody3D, ids: Array[String]) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = _chunk_seed(coord)
	var resources: Array[Dictionary] = []
	var trunk_mesh := CylinderMesh.new()
	trunk_mesh.top_radius = 0.22
	trunk_mesh.bottom_radius = 0.38
	trunk_mesh.height = 4.8
	var trunk_material := StandardMaterial3D.new()
	trunk_material.albedo_color = Color(0.25, 0.15, 0.08)
	trunk_mesh.material = trunk_material
	var canopy_mesh := SphereMesh.new()
	canopy_mesh.radius = 1.0
	canopy_mesh.height = 2.0
	canopy_mesh.material = _simple_material(Color(0.16, 0.34, 0.12))
	var bush_mesh := SphereMesh.new()
	bush_mesh.radius = 0.8
	bush_mesh.height = 1.5
	bush_mesh.material = _simple_material(Color(0.23, 0.41, 0.14))
	var rock_mesh := SphereMesh.new()
	rock_mesh.radius = 1.0
	rock_mesh.height = 1.5
	rock_mesh.material = _simple_material(Color(0.38, 0.39, 0.36))
	var trunk_transforms: Array[Transform3D] = []
	var canopy_transforms: Array[Transform3D] = []
	var bush_transforms: Array[Transform3D] = []
	var rock_transforms: Array[Transform3D] = []
	var tree_collisions: Array[Dictionary] = []
	for attempt in range(70):
		if resources.size() >= 32:
			break
		var x := float(coord.x) * CHUNK_SIZE + rng.randf_range(5.0, CHUNK_SIZE - 5.0)
		var z := float(coord.y) * CHUNK_SIZE + rng.randf_range(5.0, CHUNK_SIZE - 5.0)
		var h := map_data.get_height(x, z)
		if h < 2.0 or h > 220.0 or map_data.get_normal(x, z).y < 0.82:
			continue
		if player != null and Vector2(x - player.global_position.x, z - player.global_position.z).length() < 7.0:
			continue
		var biome := get_biome(x, z)
		var roll := rng.randf()
		var kind := "arbol"
		if roll < 0.27:
			kind = "roca"
		elif roll < 0.48:
			kind = "baya"
		elif biome == "volcan" and roll > 0.84:
			kind = "veta_obsidiana"
		elif biome == "pantano" and roll > 0.76:
			kind = "veta_arcilla"
		elif (biome == "playa" or biome == "desierto") and roll > 0.82:
			kind = "veta_sal"
		elif biome == "taiga" and roll > 0.88:
			kind = "ambar_node"
		var pos := Vector3(x, h, z)
		var record_id := "%d:%d:%d:%d" % [coord.x, coord.y, attempt, seed]
		if GameState.world_changes.has(record_id):
			var change: Dictionary = GameState.world_changes[record_id]
			if GameState.elapsed_game_time - float(change.get("time", 0.0)) < GameState.DAY_LENGTH * 3.0:
				continue
			GameState.world_changes.erase(record_id)
		var record := {"id": record_id, "type": kind, "position": pos, "biome": biome, "hits": 0, "max_hits": 3 if kind == "arbol" or kind == "roca" else 1, "transforms": []}
		if kind == "arbol":
			var scale := rng.randf_range(0.8, 1.35)
			var local_pos := pos - root.position
			var trunk_xform := Transform3D(Basis.from_scale(Vector3(scale, scale, scale)), local_pos + Vector3(0, 2.4 * scale, 0))
			var canopy_xform := Transform3D(Basis.from_scale(Vector3(2.7 * scale, 3.0 * scale, 2.7 * scale)), local_pos + Vector3(0, 5.4 * scale, 0))
			var collision := CylinderShape3D.new()
			collision.radius = 0.4 * scale
			collision.height = 4.8 * scale
			tree_collisions.append({"shape": collision, "position": local_pos + Vector3(0, 2.4 * scale, 0)})
			record.transforms.append({"kind": "tree", "index": trunk_transforms.size()})
			trunk_transforms.append(trunk_xform)
			record.transforms.append({"kind": "canopy", "index": canopy_transforms.size()})
			canopy_transforms.append(canopy_xform)
		elif kind == "roca" or kind.begins_with("veta_") or kind == "ambar_node":
			var scale := rng.randf_range(0.7, 1.5)
			var local_pos := pos - root.position + Vector3(0, 0.5 * scale, 0)
			record.transforms.append({"kind": "rock", "index": rock_transforms.size()})
			rock_transforms.append(Transform3D(Basis.from_scale(Vector3(1.3, 0.75, 1.0) * scale), local_pos))
			var collision := SphereShape3D.new()
			collision.radius = 0.9 * scale
			tree_collisions.append({"shape": collision, "position": local_pos})
		else:
			var scale := rng.randf_range(0.75, 1.35)
			var local_pos := pos - root.position + Vector3(0, 0.55 * scale, 0)
			record.transforms.append({"kind": "bush", "index": bush_transforms.size()})
			bush_transforms.append(Transform3D(Basis.from_scale(Vector3(1.0, 0.8, 1.0) * scale), local_pos))
		resources.append(record)
		ids.append(str(record.id))
		resource_nodes.append(record)
		resource_lookup[record.id] = record
	var mm_nodes := {
		"tree": _add_multimesh(root, "Troncos", trunk_mesh, trunk_transforms),
		"canopy": _add_multimesh(root, "Copas", canopy_mesh, canopy_transforms),
		"bush": _add_multimesh(root, "Matorrales", bush_mesh, bush_transforms),
		"rock": _add_multimesh(root, "Rocas", rock_mesh, rock_transforms),
	}
	for resource in resources:
		resource["multimeshes"] = mm_nodes
	for collision_data in tree_collisions:
		var shape := CollisionShape3D.new()
		shape.shape = collision_data.shape
		shape.position = collision_data.position
		collision_body.add_child(shape)

func _simple_material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.9
	return material

func _add_multimesh(parent: Node3D, node_name: String, mesh: Mesh, transforms: Array[Transform3D]) -> MultiMeshInstance3D:
	if transforms.is_empty():
		return null
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.mesh = mesh
	multimesh.instance_count = transforms.size()
	for i in range(transforms.size()):
		multimesh.set_instance_transform(i, transforms[i])
	var instance := MultiMeshInstance3D.new()
	instance.name = node_name
	instance.multimesh = multimesh
	parent.add_child(instance)
	return instance

func _chunk_seed(coord: Vector2i) -> int:
	var value := (coord.x * 374761393 + coord.y * 668265263 + seed * 1442695041) & 0x7fffffff
	return maxi(1, value)

func _update_nearest_target() -> void:
	nearest_target.clear()
	nearest_creature = null
	if player == null:
		return
	var camera := player.get_node_or_null("CameraPivot/Camera3D") as Camera3D
	if camera == null:
		return
	var origin := camera.global_position
	var direction := -camera.global_transform.basis.z
	var best_distance := 3.2
	var best_creature_distance := 3.8
	for creature in fauna_root.get_children():
		if not is_instance_valid(creature):
			continue
		var offset: Vector3 = creature.global_position + Vector3(0, 1.0, 0) - origin
		var distance: float = offset.length()
		if distance > best_creature_distance or distance < 0.1:
			continue
		if direction.dot(offset / distance) < 0.84:
			continue
		best_creature_distance = distance
		nearest_creature = creature
	for resource in resource_nodes:
		if not resource_lookup.has(resource.id):
			continue
		var position: Vector3 = resource.position
		var offset: Vector3 = position + Vector3(0, 0.7, 0) - origin
		var distance: float = offset.length()
		if distance > best_distance or distance < 0.1:
			continue
		if direction.dot(offset / distance) < 0.84:
			continue
		best_distance = distance
		nearest_target = resource

func interact() -> bool:
	if player == null:
		return false
	if nearest_creature != null and nearest_creature.has_method("interact_with_player"):
		return nearest_creature.interact_with_player()
	if player.is_in_water():
		GameState.stats.sed = minf(100.0, float(GameState.stats.sed) + 45.0)
		GameState.message("Has bebido agua fresca.")
		return true
	if nearest_target.is_empty():
		return false
	var resource_id := str(nearest_target.id)
	if resource_id == "" or not resource_lookup.has(resource_id):
		return false
	var record: Dictionary = resource_lookup[resource_id]
	if record.type == "baya" or record.type == "ambar_node":
		return _harvest(record, [])
	return false

func attack_target() -> bool:
	if nearest_target.is_empty():
		return false
	var record: Dictionary = nearest_target
	var selected_tags: Array = []
	var selected_id := GameState.current_item()
	if not selected_id.is_empty():
		var slot = GameState.inventory[GameState.selected_slot]
		selected_tags = GameState.items.get(selected_id, {}).get("etiquetas", [])
		var item_def: Dictionary = GameState.items.get(selected_id, {})
		if item_def.has("talar") and not selected_tags.has("talar"):
			selected_tags.append("talar")
		if item_def.has("picar") and not selected_tags.has("picar"):
			selected_tags.append("picar")
		if slot != null and slot.has("durability"):
			slot.durability = int(slot.durability) - 1
			if int(slot.durability) <= 0:
				GameState.message("Tu herramienta se ha roto.")
				GameState.inventory[GameState.selected_slot] = null
	var result := _harvest(record, selected_tags)
	if result:
		GameState.inventory_changed.emit()
	return result

func _harvest(record: Dictionary, tags: Array) -> bool:
	if not resource_lookup.has(record.id):
		return false
	var table: Dictionary = GameState.forage.get(record.type, {})
	var drops: Array = []
	if not table.is_empty():
		drops = _roll_drops(table.get("golpe", []), tags, str(record.biome))
	record.hits = int(record.hits) + 1
	var destroyed := int(record.hits) >= int(record.max_hits)
	if destroyed:
		drops.append_array(_roll_drops(table.get("caida", []), tags, str(record.biome)))
		_remove_resource_visual(record)
		resource_lookup.erase(record.id)
		resource_nodes.erase(record)
	for drop in drops:
		var left := GameState.add_item(str(drop.item), int(drop.cantidad))
		if left > 0:
			GameState.message("La mochila está llena; no cabe todo.")
	if drops.is_empty():
		GameState.message("Golpeas %s." % ("el árbol" if record.type == "arbol" else "la roca"))
	else:
		var names: Array[String] = []
		for drop in drops:
			names.append("%d %s" % [int(drop.cantidad), str(GameState.items.get(drop.item, {}).get("nombre", drop.item)).to_lower()])
		GameState.message("Recoges " + ", ".join(names) + ".")
	if destroyed:
		GameState.world_changes[str(record.id)] = {"removed": true, "time": GameState.elapsed_game_time}
	return true

func _roll_drops(entries: Array, tags: Array, biome: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for entry in entries:
		if entry.has("req") and not tags.has(entry.req):
			continue
		if entry.has("sin") and tags.has(entry.sin):
			continue
		if entry.has("bioma") and str(entry.bioma) != biome:
			continue
		if randf() > float(entry.get("p", 1.0)):
			continue
		var amount_range: Array = entry.get("n", [1, 1])
		var count := randi_range(int(amount_range[0]), int(amount_range[1]))
		result.append({"item": str(entry.item), "cantidad": count})
	return result

func _remove_resource_visual(record: Dictionary) -> void:
	# Retira las instancias sin reconstruir toda la malla del sector.
	for instance_data in record.get("transforms", []):
		var mm: MultiMeshInstance3D = record.get("multimeshes", {}).get(instance_data.kind)
		if is_instance_valid(mm) and mm.multimesh != null:
			mm.multimesh.set_instance_transform(int(instance_data.index), Transform3D(Basis.from_scale(Vector3.ZERO), Vector3.ZERO))
	var coord := Vector2i(floori(record.position.x / CHUNK_SIZE), floori(record.position.z / CHUNK_SIZE))
	var root := world_root.get_node_or_null("Terreno_%d_%d" % [coord.x, coord.y])
	if root != null:
		for node in root.get_children():
			if node is StaticBody3D:
				for shape in node.get_children():
					if shape is CollisionShape3D and shape.global_position.distance_to(record.position) < 3.0:
						shape.disabled = true

func _create_fauna() -> void:
	var scene_script := preload("res://scripts/creature.gd")
	for i in range(7):
		var angle := TAU * float(i) / 7.0
		var radius := 42.0 + float(i % 3) * 19.0
		var x := spawn_point.x + cos(angle) * radius
		var z := spawn_point.z + sin(angle) * radius
		var grounded := _find_safe_fauna_position(x, z, 120.0)
		if grounded == Vector3.INF:
			continue
		x = grounded.x
		z = grounded.z
		var province := get_province(x, z)
		var species_id := _species_for_province(province, i)
		if species_id.is_empty():
			continue
		if species_id == "tyrannosaurus":
			radius = 125.0
			x = spawn_point.x + cos(angle) * radius
			z = spawn_point.z + sin(angle) * radius
			grounded = _find_safe_fauna_position(x, z, 200.0)
			if grounded == Vector3.INF:
				continue
			x = grounded.x
			z = grounded.z
		var creature := scene_script.new()
		creature.configure(species_id, Vector3(x, map_data.get_height(x, z), z), self)
		fauna_root.add_child(creature)

func _find_safe_fauna_position(origin_x: float, origin_z: float, max_radius: float) -> Vector3:
	var origin := Vector3(origin_x, 0.0, origin_z)
	if _is_safe_fauna_ground(origin_x, origin_z):
		origin.y = map_data.get_height(origin_x, origin_z)
		return origin
	var ring := 12.0
	while ring <= max_radius:
		for direction in range(24):
			var angle := TAU * float(direction) / 24.0
			var x := origin_x + cos(angle) * ring
			var z := origin_z + sin(angle) * ring
			if _is_safe_fauna_ground(x, z):
				return Vector3(x, map_data.get_height(x, z), z)
		ring += 12.0
	return Vector3.INF

func _is_safe_fauna_ground(x: float, z: float) -> bool:
	return map_data.get_height(x, z) > 1.2 and map_data.get_normal(x, z).y > 0.88 and not get_province(x, z).is_empty()

func _species_for_province(province: String, offset: int) -> String:
	var species_by_province := {
		"hell_creek": ["parasaurolophus", "triceratops", "ankylosaurus", "tyrannosaurus"],
		"morrison": ["stegosaurus", "braquiosaurio"],
		"nemegt": ["gallimimus"],
	}
	var options: Array = species_by_province.get(province, ["parasaurolophus", "triceratops"])
	return str(options[offset % options.size()])

func get_species_model(species_id: String) -> PackedScene:
	var model_id := species_id
	if species_id == "raptor":
		model_id = "raptor"
	var candidates := [
		"res://assets/godot_models/fauna/hf/%s.glb" % model_id,
		"res://assets/godot_models/fauna/%s.glb" % model_id,
	]
	if species_id == "raptor":
		candidates.append("res://assets/godot_models/fauna/velociraptor.glb")
	for file in candidates:
		if ResourceLoader.exists(file):
			return load(file) as PackedScene
	return null

func player_attacked_creature(creature: Node, damage: float) -> void:
	if creature.has_method("take_hit"):
		creature.take_hit(damage)

func add_dropped_loot(item_id: String, amount: int, position: Vector3) -> void:
	var pickup := Area3D.new()
	pickup.name = "Botín_%s" % item_id
	pickup.position = position
	pickup.set_meta("item_id", item_id)
	pickup.set_meta("amount", amount)
	var shape := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 1.0
	shape.shape = sphere
	pickup.add_child(shape)
	var visual := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 0.24
	mesh.height = 0.48
	visual.mesh = mesh
	visual.material_override = _simple_material(Color(0.71, 0.52, 0.27))
	pickup.add_child(visual)
	pickup.body_entered.connect(func(body: Node3D):
		if body == player:
			var left := GameState.add_item(item_id, amount)
			if left == 0:
				GameState.message("Has recogido %s ×%d." % [GameState.items.get(item_id, {}).get("nombre", item_id), amount])
				pickup.queue_free()
	)
	world_root.add_child(pickup)

func _restore_placed_objects() -> void:
	for data in GameState.placed_objects:
		_create_placed_visual(data)

func place_selected_object(position: Vector3, yaw: float = 0.0) -> bool:
	var item_id := GameState.current_item()
	var item: Dictionary = GameState.items.get(item_id, {})
	if not item.has("pieza") and item_id != "fogata":
		return false
	if GameState.inventory[GameState.selected_slot] == null:
		return false
	var data := {"id": "placed_%d" % Time.get_ticks_msec(), "item": item_id, "position": [position.x, position.y, position.z], "yaw": yaw}
	GameState.placed_objects.append(data)
	GameState._consume_slot(GameState.selected_slot)
	_create_placed_visual(data)
	GameState.save_game()
	return true

func _create_placed_visual(data: Dictionary) -> void:
	var item_id := str(data.get("item", "fogata"))
	var position_data: Array = data.get("position", [0, 0, 0])
	var root := StaticBody3D.new()
	root.name = str(data.get("id", item_id))
	root.position = Vector3(float(position_data[0]), float(position_data[1]), float(position_data[2]))
	root.rotation.y = float(data.get("yaw", 0.0))
	var mesh := MeshInstance3D.new()
	var material := _simple_material(Color(0.48, 0.32, 0.18))
	match item_id:
		"fogata":
			var fire := CylinderMesh.new()
			fire.top_radius = 0.48
			fire.bottom_radius = 0.55
			fire.height = 0.3
			mesh.mesh = fire
			material.albedo_color = Color(0.27, 0.21, 0.13)
			var light := OmniLight3D.new()
			light.light_color = Color(1.0, 0.32, 0.07)
			light.light_energy = 1.6
			light.omni_range = 8.0
			light.position.y = 1.1
			root.add_child(light)
			var flame := MeshInstance3D.new()
			var flame_mesh := SphereMesh.new()
			flame_mesh.radius = 0.28
			flame_mesh.height = 0.8
			flame.mesh = flame_mesh
			flame.position.y = 0.55
			flame.material_override = _simple_material(Color(1.0, 0.36, 0.05))
			root.add_child(flame)
		"cama_hojas":
			var bed := BoxMesh.new()
			bed.size = Vector3(1.8, 0.25, 1.0)
			mesh.mesh = bed
			mesh.position.y = 0.25
			material.albedo_color = Color(0.35, 0.39, 0.22)
		"refugio_ramas":
			var roof := PrismMesh.new()
			roof.size = Vector3(2.8, 2.1, 2.7)
			mesh.mesh = roof
			mesh.position.y = 1.0
			material.albedo_color = Color(0.28, 0.34, 0.16)
		"cesta", "cofre_madera", "vasija_barro":
			var box := BoxMesh.new()
			box.size = Vector3(0.9, 0.8, 0.8)
			mesh.mesh = box
			mesh.position.y = 0.4
			material.albedo_color = Color(0.52, 0.33, 0.15) if item_id != "vasija_barro" else Color(0.46, 0.27, 0.18)
		_:
			var box := BoxMesh.new()
			box.size = Vector3(1.0, 0.5, 1.0)
			mesh.mesh = box
	mesh.material_override = material
	root.add_child(mesh)
	var shape := CollisionShape3D.new()
	var collision := BoxShape3D.new()
	collision.size = Vector3(1.3, 0.7, 1.3)
	shape.shape = collision
	shape.position.y = 0.4
	root.add_child(shape)
	world_root.add_child(root)
	placed_nodes.append(root)

func is_near_fire(position: Vector3, distance: float = 5.0) -> bool:
	for data in GameState.placed_objects:
		if str(data.get("item", "")) != "fogata":
			continue
		var p: Array = data.get("position", [0, 0, 0])
		if position.distance_to(Vector3(float(p[0]), float(p[1]), float(p[2]))) < distance:
			return true
	return false
