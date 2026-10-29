class_name IslaPlayerViewmodel
extends Node3D

## Vista en primera persona migrada desde src/player/viewmodel.js y manos.js.
## El rig es local a la cámara, no participa en físicas y comparte mallas/materiales.

const SPEAR_ITEMS := ["lanza", "lanza_hueso", "lanza_cuerno", "jabalina"]
const AXE_ITEMS := ["hacha_piedra", "pico_piedra", "martillo_piedra", "maza_piedra", "garrote"]
const KNIFE_ITEMS := ["cuchillo_piedra", "cuchillo_hueso", "cuchillo_diente", "cuchillo_obsidiana", "punzon_hueso"]
const PLAYER_SPRINT_SPEED := 7.6

var player: IslaPlayer
var right_upper: MeshInstance3D
var right_forearm: MeshInstance3D
var left_upper: MeshInstance3D
var left_forearm: MeshInstance3D
var original_hand_rig: Node3D
var right_arm_rig: Node3D
var left_arm_rig: Node3D
var right_arm_mesh: MeshInstance3D
var left_arm_mesh: MeshInstance3D
var right_leather_cuff: MeshInstance3D
var left_leather_cuff: MeshInstance3D
var right_cuff: MeshInstance3D
var left_cuff: MeshInstance3D
var right_hand: Node3D
var left_hand: Node3D
var right_grip: Node3D
var left_grip: Node3D
var tool_mount: Node3D
var current_tool: Node3D
var torch_flame: MeshInstance3D
var torch_light: OmniLight3D
var skin_material: StandardMaterial3D
var nail_material: StandardMaterial3D
var cuff_material: StandardMaterial3D
var time_alive := 0.0
var gait_phase := 0.0
var gait_amount := 0.0
var sprint_amount := 0.0
var look_sway := Vector2.ZERO
var attack_time := -1.0
var attack_duration := 0.45
var attack_kind := "fist"
var jump_kick := 0.0
var jump_velocity := 0.0
var equip_time := 0.0
var equipped_id := ""
var tool_kind := "fist"
var tool_height := 0.5
var was_on_floor := true

func configure(owner: IslaPlayer) -> void:
	player = owner

func _ready() -> void:
	name = "Brazos y herramientas"
	position = Vector3.ZERO
	_skin_materials()
	_build_arm_rig()
	_sync_equipment(true)
	set_process(true)

func _skin_materials() -> void:
	skin_material = StandardMaterial3D.new()
	skin_material.albedo_color = Color(0.66, 0.43, 0.32)
	skin_material.roughness = 0.68
	skin_material.metallic = 0.0
	skin_material.specular_mode = BaseMaterial3D.SPECULAR_SCHLICK_GGX
	nail_material = StandardMaterial3D.new()
	nail_material.albedo_color = Color(0.76, 0.59, 0.48)
	nail_material.roughness = 0.42
	cuff_material = StandardMaterial3D.new()
	cuff_material.albedo_color = Color(0.20, 0.105, 0.052)
	cuff_material.roughness = 0.92

func _build_arm_rig() -> void:
	var source_scene := load("res://assets/godot_models/player/original_hands.glb") as PackedScene
	if source_scene != null:
		original_hand_rig = source_scene.instantiate() as Node3D
		original_hand_rig.name = "Rig procedural original exportado desde manos.js"
		add_child(original_hand_rig)
		right_hand = _find_node_named(original_hand_rig, "PunoDerecho") as Node3D
		left_hand = _find_node_named(original_hand_rig, "PunoIzquierdo") as Node3D
		right_grip = _find_node_named(original_hand_rig, "ManoAgarreDerecha") as Node3D
		left_grip = _find_node_named(original_hand_rig, "ManoAgarreIzquierda") as Node3D
		right_arm_rig = _find_node_named(original_hand_rig, "AntebrazoDerecho") as Node3D
		left_arm_rig = _find_node_named(original_hand_rig, "AntebrazoIzquierdo") as Node3D
		right_arm_mesh = _find_node_named(right_arm_rig, "Mesh9") as MeshInstance3D
		right_leather_cuff = _find_node_named(right_arm_rig, "Mesh10") as MeshInstance3D
		left_arm_mesh = _find_node_named(left_arm_rig, "Mesh12") as MeshInstance3D
		left_leather_cuff = _find_node_named(left_arm_rig, "Mesh13") as MeshInstance3D
		if right_hand != null and left_hand != null and right_grip != null and left_grip != null and right_arm_mesh != null and left_arm_mesh != null and right_leather_cuff != null and left_leather_cuff != null:
			right_cuff = right_leather_cuff
			left_cuff = left_leather_cuff
			right_arm_rig.visible = true
			left_arm_rig.visible = true
			tool_mount = Node3D.new()
			tool_mount.name = "Slot de herramienta original"
			add_child(tool_mount)
			right_grip.position = Vector3.ZERO
			left_grip.visible = false
			original_hand_rig.remove_child(right_grip)
			original_hand_rig.remove_child(left_grip)
			tool_mount.add_child(right_grip)
			tool_mount.add_child(left_grip)
			torch_flame = _sphere_mesh("Llama de antorcha", Vector3(0.025, 0.05, 0.025), _emissive_material(Color(1.0, 0.34, 0.06)))
			torch_flame.position = Vector3(0, 0.55, 0)
			torch_flame.visible = false
			tool_mount.add_child(torch_flame)
			torch_light = OmniLight3D.new()
			torch_light.name = "Luz de antorcha en mano"
			torch_light.light_color = Color(1.0, 0.42, 0.16)
			torch_light.light_energy = 1.35
			torch_light.omni_range = 7.0
			torch_light.shadow_enabled = false
			torch_light.position = Vector3(0, 0.48, 0)
			torch_light.visible = false
			tool_mount.add_child(torch_light)
			return
	right_upper = _capsule_mesh("Brazo superior derecho", 0.088, skin_material)
	right_forearm = _capsule_mesh("Antebrazo derecho", 0.078, skin_material)
	left_upper = _capsule_mesh("Brazo superior izquierdo", 0.088, skin_material)
	left_forearm = _capsule_mesh("Antebrazo izquierdo", 0.078, skin_material)
	add_child(right_upper)
	add_child(right_forearm)
	add_child(left_upper)
	add_child(left_forearm)
	right_cuff = _cuff_mesh("Muñequera derecha")
	left_cuff = _cuff_mesh("Muñequera izquierda")
	add_child(right_cuff)
	add_child(left_cuff)
	right_hand = _make_hand("Mano derecha", 1.0)
	left_hand = _make_hand("Mano izquierda", -1.0)
	add_child(right_hand)
	add_child(left_hand)
	tool_mount = Node3D.new()
	tool_mount.name = "Empuñadura"
	add_child(tool_mount)
	torch_flame = _sphere_mesh("Llama de antorcha", Vector3(0.025, 0.05, 0.025), _emissive_material(Color(1.0, 0.34, 0.06)))
	torch_flame.position = Vector3(0, 0.55, 0)
	torch_flame.visible = false
	tool_mount.add_child(torch_flame)
	torch_light = OmniLight3D.new()
	torch_light.name = "Luz de antorcha en mano"
	torch_light.light_color = Color(1.0, 0.42, 0.16)
	torch_light.light_energy = 1.35
	torch_light.omni_range = 7.0
	torch_light.shadow_enabled = false
	torch_light.position = Vector3(0, 0.48, 0)
	torch_light.visible = false
	tool_mount.add_child(torch_light)

func _find_node_named(root: Node, target_name: String) -> Node:
	if root == null:
		return null
	if root.name == target_name:
		return root
	for child in root.get_children():
		var found := _find_node_named(child, target_name)
		if found != null:
			return found
	return null

func _emissive_material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = 2.4
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	return material

func _capsule_mesh(label: String, radius: float, material: Material) -> MeshInstance3D:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = label
	var capsule := CapsuleMesh.new()
	capsule.radius = radius
	capsule.height = 1.0
	capsule.radial_segments = 12
	capsule.rings = 4
	mesh_instance.mesh = capsule
	mesh_instance.material_override = material
	mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mesh_instance

func _cuff_mesh(label: String) -> MeshInstance3D:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = label
	var cuff := TorusMesh.new()
	cuff.inner_radius = 0.060
	cuff.outer_radius = 0.079
	cuff.rings = 8
	cuff.ring_segments = 16
	mesh_instance.mesh = cuff
	mesh_instance.material_override = cuff_material
	mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mesh_instance

func _sphere_mesh(label: String, scale_value: Vector3, material: Material) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.name = label
	var sphere := SphereMesh.new()
	sphere.radius = 1.0
	sphere.height = 2.0
	sphere.radial_segments = 12
	sphere.rings = 8
	instance.mesh = sphere
	instance.scale = scale_value
	instance.material_override = material
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return instance

func _make_hand(label: String, side: float) -> Node3D:
	var hand := Node3D.new()
	hand.name = label
	var palm := _sphere_mesh("Palma", Vector3(0.072, 0.084, 0.046), skin_material)
	palm.position = Vector3(0, -0.035, -0.005)
	hand.add_child(palm)
	# Dedos en falanges articuladas visualmente; se pliegan sobre la palma como en el puño del original.
	for finger in range(4):
		var x := (float(finger) - 1.5) * 0.034
		var y0 := -0.005 - absf(float(finger) - 1.5) * 0.006
		var p0 := Vector3(x, y0, -0.02)
		var p1 := Vector3(x + side * 0.004, y0 - 0.034, -0.045)
		var p2 := Vector3(x - side * 0.006, y0 - 0.054, -0.026)
		var p3 := Vector3(x - side * 0.012, y0 - 0.045, 0.004)
		_add_hand_bone(hand, "Falange proximal", p0, p1, 0.015)
		_add_hand_bone(hand, "Falange media", p1, p2, 0.0135)
		_add_hand_bone(hand, "Falange distal", p2, p3, 0.012)
		var nail := _sphere_mesh("Uña", Vector3(0.010, 0.012, 0.004), nail_material)
		nail.position = p3 + Vector3(0, -0.004, -0.011)
		hand.add_child(nail)
	# Pulgar cruzado sobre las falanges y nudillos marcados.
	var thumb_start := Vector3(-side * 0.052, -0.018, -0.005)
	var thumb_mid := Vector3(-side * 0.084, -0.034, -0.042)
	var thumb_end := Vector3(-side * 0.046, -0.054, -0.055)
	_add_hand_bone(hand, "Pulgar proximal", thumb_start, thumb_mid, 0.018)
	_add_hand_bone(hand, "Pulgar distal", thumb_mid, thumb_end, 0.015)
	for finger in range(4):
		var x := (float(finger) - 1.5) * 0.034
		var knuckle := _sphere_mesh("Nudillo", Vector3(0.018, 0.016, 0.015), skin_material)
		knuckle.position = Vector3(x, -0.008, -0.029)
		hand.add_child(knuckle)
	return hand

func _add_hand_bone(parent: Node3D, label: String, a: Vector3, b: Vector3, radius: float) -> void:
	var bone := _capsule_mesh(label, radius, skin_material)
	_set_segment(bone, a, b)
	parent.add_child(bone)

func _set_segment(mesh_instance: MeshInstance3D, a: Vector3, b: Vector3) -> void:
	var delta := b - a
	var length := maxf(0.001, delta.length())
	mesh_instance.position = (a + b) * 0.5
	mesh_instance.basis = Basis(Quaternion(Vector3.UP, delta / length))
	mesh_instance.scale = Vector3.ONE * Vector3(1, length, 1)

func _place_cuff(mesh_instance: MeshInstance3D, elbow: Vector3, wrist: Vector3) -> void:
	var direction := (wrist - elbow).normalized()
	mesh_instance.position = wrist - direction * 0.045
	mesh_instance.basis = Basis(Quaternion(Vector3.UP, direction))
	mesh_instance.scale = Vector3.ONE

func _process(delta: float) -> void:
	if not is_instance_valid(player):
		visible = false
		return
	time_alive += delta
	_sync_equipment(false)
	var alive := GameState.game_active and not GameState.dead and not player.swimming
	visible = alive
	if not alive:
		if torch_light != null: torch_light.visible = false
		return
	var horizontal_speed := Vector2(player.velocity.x, player.velocity.z).length()
	var moving := player.is_on_floor() and horizontal_speed > 0.45
	var sprinting := Input.is_action_pressed("sprint") and moving and not player.crouched
	var target_bob := clampf(horizontal_speed / PLAYER_SPRINT_SPEED, 0.0, 1.0) if moving else 0.0
	gait_amount = move_toward(gait_amount, target_bob, delta * 7.0)
	sprint_amount = move_toward(sprint_amount, 1.0 if sprinting else 0.0, delta * 6.0)
	gait_phase += horizontal_speed * delta * (1.15 if not sprinting else 1.35)
	look_sway = look_sway.lerp(Vector2.ZERO, 1.0 - exp(-delta * 9.0))
	# Solución crítica cerrada del muelle de salto: mantiene la animación estable en
	# equipos lentos donde un paso de render grande haría divergir Euler explícito.
	var spring_frequency := 11.0
	var spring_coefficient := jump_velocity + spring_frequency * jump_kick
	var spring_decay := exp(-spring_frequency * delta)
	jump_kick = (jump_kick + spring_coefficient * delta) * spring_decay
	jump_velocity = (jump_velocity - spring_frequency * spring_coefficient * delta) * spring_decay
	if not was_on_floor and player.is_on_floor():
		jump_velocity -= 0.44
	was_on_floor = player.is_on_floor()
	if attack_time >= 0.0:
		attack_time += delta
		if attack_time >= attack_duration:
			attack_time = -1.0
	_update_pose(delta, horizontal_speed)
	if equipped_id == "antorcha":
		var flicker := 0.9 + 0.12 * sin(time_alive * 18.0) + 0.07 * sin(time_alive * 7.0)
		torch_light.light_energy = flicker * (0.6 + 0.4 * maxf(0.0, sin(GameState.hour_of_day() / 24.0 * TAU)))

func add_look_sway(relative: Vector2) -> void:
	look_sway.x = clampf(look_sway.x - relative.x * 0.00035, -0.07, 0.07)
	look_sway.y = clampf(look_sway.y - relative.y * 0.00035, -0.06, 0.06)

func trigger_attack(item_id: String = "") -> void:
	attack_kind = _kind_for(item_id if not item_id.is_empty() else equipped_id)
	attack_duration = 0.40 if attack_kind == "fist" else (0.34 if attack_kind == "knife" else (0.50 if attack_kind == "bow" else 0.55))
	attack_time = 0.0
	if attack_kind == "fist":
		attack_kind = "fist_left" if randf() < 0.5 else "fist_right"

func trigger_interact() -> void:
	attack_kind = "interact"
	attack_duration = 0.34
	attack_time = 0.0

func trigger_jump() -> void:
	jump_velocity -= 0.9

func _sync_equipment(force: bool) -> void:
	var item_id := GameState.current_item()
	var item: Dictionary = GameState.items.get(item_id, {})
	var next_kind := _kind_for(item_id) if item.get("tipo", "") in ["arma", "herramienta"] else "fist"
	if force or item_id != equipped_id or next_kind != tool_kind:
		equipped_id = item_id
		tool_kind = next_kind
		equip_time = 0.0
		_equip_tool_model(item_id if next_kind != "fist" else "")
		if original_hand_rig != null:
			right_hand.visible = next_kind == "fist"
			left_hand.visible = next_kind == "fist"
			right_grip.visible = next_kind != "fist"
			left_grip.visible = next_kind == "spear"
			right_arm_rig.visible = true
			left_arm_rig.visible = next_kind == "fist" or next_kind == "spear"

func _equip_tool_model(item_id: String) -> void:
	if current_tool != null and is_instance_valid(current_tool):
		current_tool.queue_free()
	current_tool = null
	torch_flame.visible = item_id == "antorcha"
	torch_light.visible = item_id == "antorcha"
	if item_id.is_empty():
		return
	var path := "res://assets/godot_models/objetos/%s.glb" % item_id
	if not ResourceLoader.exists(path):
		return
	var packed := load(path) as PackedScene
	if packed == null:
		return
	current_tool = packed.instantiate() as Node3D
	if current_tool == null:
		return
	current_tool.name = "Herramienta equipada: " + item_id
	tool_mount.add_child(current_tool)
	_fit_tool(current_tool, item_id)

func _fit_tool(model: Node3D, item_id: String) -> void:
	var bounds := _collect_model_bounds(model, Transform3D.IDENTITY)
	if bounds.size.length_squared() < 0.00001:
		return
	var target_height := 0.54
	if item_id in SPEAR_ITEMS: target_height = 0.82
	elif item_id in AXE_ITEMS: target_height = 0.66
	elif item_id in KNIFE_ITEMS: target_height = 0.44
	elif item_id == "antorcha": target_height = 0.55
	elif item_id == "arco": target_height = 0.66
	elif item_id == "honda": target_height = 0.48
	var scale_factor := target_height / maxf(bounds.size.y, 0.001)
	model.scale = Vector3.ONE * scale_factor
	model.position = Vector3(-bounds.get_center().x, -bounds.position.y, -bounds.get_center().z) * scale_factor
	tool_height = target_height

func _collect_model_bounds(node: Node, parent_transform: Transform3D) -> AABB:
	var local_transform: Transform3D = parent_transform
	if node is Node3D:
		local_transform = parent_transform * node.transform
	var bounds := AABB()
	var has_bounds := false
	if node is MeshInstance3D and node.mesh != null:
		bounds = local_transform * node.get_aabb()
		has_bounds = true
	for child in node.get_children():
		var child_bounds := _collect_model_bounds(child, local_transform)
		if child_bounds.size.length_squared() <= 0.000001: continue
		if has_bounds: bounds = bounds.merge(child_bounds)
		else: bounds = child_bounds; has_bounds = true
	return bounds if has_bounds else AABB()

func _kind_for(item_id: String) -> String:
	if item_id in SPEAR_ITEMS: return "spear"
	if item_id in AXE_ITEMS: return "axe"
	if item_id in KNIFE_ITEMS: return "knife"
	if item_id == "antorcha": return "torch"
	if item_id == "arco": return "bow"
	if item_id == "honda": return "sling"
	return "fist"

func _update_pose(delta: float, horizontal_speed: float) -> void:
	var breath := sin(time_alive * 1.7) * 0.0035
	var breath_roll := sin(time_alive * 1.1 + 1.0) * 0.006
	var bob_x := cos(gait_phase) * 0.011 * gait_amount
	var bob_y := absf(sin(gait_phase)) * -0.016 * gait_amount + sin(gait_phase * 2.0) * 0.004 * gait_amount
	var common := Vector3(look_sway.x * 0.5 + bob_x + sprint_amount * 0.03, breath + bob_y + jump_kick * 0.12 - sprint_amount * 0.06, sprint_amount * 0.03)
	var rotation_sway := Vector3(look_sway.y * 0.9 + breath_roll + sprint_amount * 0.45, look_sway.x * 1.1 - sprint_amount * 0.25, breath_roll * 0.5 + cos(gait_phase) * 0.012 * gait_amount - sprint_amount * 0.25)
	var right_pose: Dictionary = _base_pose(tool_kind, 1.0)
	var left_pose: Dictionary = _base_pose(tool_kind, -1.0)
	var attack := _attack_pose()
	var attack_mix := 1.0 if attack_time >= 0.0 else 0.0
	var equip_blend := smoothstep(0.0, 1.0, clampf(equip_time / 0.28, 0.0, 1.0))
	equip_time += delta
	var right_extra := common + attack * attack_mix
	var right_position: Vector3 = right_pose["position"]
	var right_rotation: Vector3 = right_pose["rotation"]
	right_position += right_extra
	right_rotation += rotation_sway + attack_pose_rotation(attack, attack_mix)
	if equip_blend < 1.0:
		right_position.y -= (1.0 - equip_blend) * 0.42
	var left_extra := common * Vector3(-1, 1, 1)
	if attack_time >= 0.0 and attack_kind == "fist_left": left_extra += attack
	var left_position: Vector3 = left_pose["position"]
	var left_rotation: Vector3 = left_pose["rotation"]
	left_position += left_extra
	left_rotation += rotation_sway * Vector3(1, -1, -1)
	if original_hand_rig != null:
		right_hand.position = right_position
		right_hand.rotation = right_rotation
		tool_mount.position = right_position
		tool_mount.rotation = right_rotation
		right_grip.position = Vector3.ZERO
		left_grip.position = Vector3(0.0, 0.4, 0.0) if tool_kind == "spear" else Vector3.ZERO
		var wrist_offset := Vector3(0.002, -0.004, 0.075) if tool_kind == "fist" else Vector3(0.012, -0.075, 0.062)
		var right_wrist := right_position + Basis.from_euler(right_rotation) * wrist_offset
		var elbow_r := Vector3(0.34, -0.72, 0.26) + common * 0.3
		_place_original_arm(right_arm_mesh, right_leather_cuff, elbow_r, right_wrist)
		var show_left := tool_kind == "fist" or tool_kind == "spear"
		left_arm_rig.visible = show_left
		if tool_kind == "fist":
			left_hand.position = left_position
			left_hand.rotation = left_rotation
		var elbow_l := Vector3(-0.34, -0.72, 0.26) + common * Vector3(-0.3, 0.3, 0.3)
		var left_wrist := left_position + Basis.from_euler(left_rotation) * wrist_offset
		if tool_kind == "spear":
			elbow_l = Vector3(-0.2, -0.7, 0.3)
			left_wrist = tool_mount.transform * (left_grip.position + Vector3(0.012, -0.075, 0.062))
		_place_original_arm(left_arm_mesh, left_leather_cuff, elbow_l, left_wrist)
	else:
		var elbow_r_fallback := Vector3(0.72, -0.86, -0.18) + common * 0.35
		_set_segment(right_upper, Vector3(0.55, -1.02, 0.17) + common * 0.25, elbow_r_fallback)
		_set_segment(right_forearm, elbow_r_fallback, right_position + Vector3(0, 0.025, 0.015))
		_place_cuff(right_cuff, elbow_r_fallback, right_position)
		right_hand.position = right_position
		right_hand.rotation = right_rotation
		var show_left_fallback := tool_kind == "fist" or tool_kind == "spear"
		left_upper.visible = show_left_fallback
		left_forearm.visible = show_left_fallback
		left_cuff.visible = show_left_fallback
		left_hand.visible = show_left_fallback
		var elbow_l_fallback := Vector3(-0.72, -0.86, -0.18) + common * Vector3(-0.35, 0.35, 0.35)
		_set_segment(left_upper, Vector3(-0.55, -1.02, 0.17) + common * Vector3(-0.25, 0.25, 0.25), elbow_l_fallback)
		_set_segment(left_forearm, elbow_l_fallback, left_position + Vector3(0, 0.025, 0.015))
		_place_cuff(left_cuff, elbow_l_fallback, left_position)
		left_hand.position = left_position
		left_hand.rotation = left_rotation
		tool_mount.position = right_position
		tool_mount.rotation = right_rotation
	if torch_light != null and tool_kind == "torch":
		torch_light.visible = true
		torch_flame.visible = true

func _place_original_arm(arm_mesh: MeshInstance3D, cuff_mesh: MeshInstance3D, elbow: Vector3, wrist: Vector3) -> void:
	var delta := wrist - elbow
	var length := maxf(0.001, delta.length())
	var direction := delta / length
	var orientation := Basis(Quaternion(Vector3.UP, direction))
	arm_mesh.position = (elbow + wrist) * 0.5
	arm_mesh.basis = orientation
	arm_mesh.scale = Vector3(1.0, length, 1.0)
	cuff_mesh.position = wrist - direction * 0.075
	cuff_mesh.basis = orientation
	cuff_mesh.scale = Vector3.ONE

func _base_pose(kind: String, side: float) -> Dictionary:
	if kind == "spear":
		return {"position": Vector3(0.20 * side, -0.30, -0.46), "rotation": Vector3(-1.0, 0.1 * side, 0.12 * side)}
	if kind == "axe":
		return {"position": Vector3(0.25 * side, -0.24, -0.54), "rotation": Vector3(-0.45, 0.5 * side, 0.12 * side)}
	if kind == "knife":
		return {"position": Vector3(0.20 * side, -0.20, -0.46), "rotation": Vector3(-0.9, 0.2 * side, 0.15 * side)}
	if kind == "torch":
		return {"position": Vector3(0.25 * side, -0.26, -0.5), "rotation": Vector3(-0.3, 0.12 * side, 0.2 * side)}
	if kind == "bow":
		return {"position": Vector3(0.22 * side, -0.2, -0.55), "rotation": Vector3(0, 0.1 * side, 0)}
	if kind == "sling":
		return {"position": Vector3(0.22 * side, -0.26, -0.5), "rotation": Vector3(-0.5, 0.1 * side, 0.2 * side)}
	return {"position": Vector3(0.17 * side, -0.20, -0.46), "rotation": Vector3(0.12, 0.3 * side, -0.06 * side)}

func _attack_pose() -> Vector3:
	if attack_time < 0.0:
		return Vector3.ZERO
	var progress := clampf(attack_time / attack_duration, 0.0, 1.0)
	if attack_kind == "axe":
		if progress < 0.24: return Vector3(0.02, 0.10, 0.07) * smoothstep(0.0, 0.24, progress)
		if progress < 0.44: return Vector3(0.0, -0.13, -0.18) * smoothstep(0.24, 0.44, progress)
		return Vector3(0, 0, 0).lerp(Vector3(0, -0.13, -0.18), 1.0 - smoothstep(0.44, 1.0, progress))
	if attack_kind == "spear":
		var thrust := sin(progress * PI) if progress > 0.2 else smoothstep(0.0, 0.2, progress)
		return Vector3(0.02, 0.02, -0.40 * thrust)
	if attack_kind == "knife":
		var slash := sin(progress * PI)
		return Vector3(-0.12 * slash, -0.05 * slash, -0.20 * slash)
	if attack_kind == "bow":
		return Vector3(0, 0.012, 0.07 * sin(progress * PI))
	if attack_kind == "sling":
		return Vector3(0.06 * sin(progress * PI), 0, -0.08 * sin(progress * PI))
	if attack_kind == "torch":
		return Vector3(0, -0.06 * sin(progress * PI), -0.10 * sin(progress * PI))
	var side := -1.0 if attack_kind == "fist_left" else 1.0
	return Vector3(side * -0.06 * sin(progress * PI), 0.06 * sin(progress * PI), -0.30 * sin(progress * PI))

func attack_pose_rotation(offset: Vector3, mix: float) -> Vector3:
	if mix <= 0.0: return Vector3.ZERO
	var p := clampf(attack_time / attack_duration, 0.0, 1.0)
	if attack_kind == "axe": return Vector3(0.95 * (1.0 - p) - 1.15 * sin(p * PI), 0, -0.3 * sin(p * PI)) * mix
	if attack_kind == "spear": return Vector3(0.18 * sin(p * PI), 0, 0) * mix
	if attack_kind == "knife": return Vector3(-0.5 * sin(p * PI), -0.2 * sin(p * PI), 0.7 * sin(p * PI)) * mix
	return Vector3(-0.25 * sin(p * PI), 0, 0) * mix

