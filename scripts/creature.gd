class_name IslaCreature
extends CharacterBody3D

const GRAVITY := 18.0
const MODEL_SCALE := {
	"tyrannosaurus": 1.25, "raptor": 0.48, "compsognatus": 0.16, "gallimimus": 0.82,
	"parasaurolophus": 0.9, "stegosaurus": 0.95, "ankylosaurus": 0.82,
	"triceratops": 0.9, "braquiosaurio": 1.05, "pteranodon": 0.65,
}
const WALK_SPEED := {
	"tyrannosaurus": 3.3, "raptor": 4.3, "compsognatus": 2.8, "gallimimus": 4.8,
	"parasaurolophus": 2.7, "stegosaurus": 2.0, "ankylosaurus": 1.8,
	"triceratops": 2.3, "braquiosaurio": 1.7, "pteranodon": 4.2,
}

var species_id: String = "parasaurolophus"
var creature_id: String = ""
var island: IslaIslandWorld
var species: Dictionary = {}
var detail: Dictionary = {}
var model_root: Node3D
var visual_motion_root: Node3D
var collider_shape: CollisionShape3D
var animation_player: AnimationPlayer
var health := 100.0
var max_health := 100.0
var is_dead := false
var state := "wander"
var state_time := 0.0
var think_timer := 0.0
var attack_cooldown := 0.0
var goal := Vector3.ZERO
var relationship: Dictionary = {}
var has_model := false
var speed := 2.5
var name_label: Label3D
var fallback_legs: Array[MeshInstance3D] = []
var visual_time := 0.0
var hit_reaction := 0.0
var attack_motion := 0.0

func configure(id: String, initial_position: Vector3, world: IslaIslandWorld) -> void:
	species_id = id
	island = world
	position = initial_position
	species = _catalog_entry(id)
	detail = GameState.fauna_data.get("detail", {}).get(id, {})
	creature_id = "%s_%d_%d" % [id, roundi(initial_position.x), roundi(initial_position.z)]
	speed = float(WALK_SPEED.get(id, 2.4))
	var mass := float(species.get("masa", 250.0))
	max_health = clampf(sqrt(maxf(1.0, mass)) * 3.5, 30.0, 330.0)
	health = max_health
	relationship = GameState.creature_records.get(creature_id, {"habituation": 0.0, "offerings": 0, "trust": 0.0, "tamed": false})
	_build_model()

func _catalog_entry(id: String) -> Dictionary:
	for entry in GameState.fauna_data.get("catalogue", []):
		if str(entry.get("id", "")) == id:
			return entry
	return {"id": id, "nombre": id.capitalize(), "tamano": 4.0, "masa": 300.0}

func _ready() -> void:
	name = species_id
	collision_layer = 1
	collision_mask = 1
	var length := float(species.get("tamano", 4.0))
	var radius := clampf(length * 0.09, 0.28, 0.95)
	var height := clampf(length * 0.24, 0.85, 3.2)
	var shape := CapsuleShape3D.new()
	shape.radius = radius
	shape.height = maxf(height, radius * 2.0)
	collider_shape = CollisionShape3D.new()
	collider_shape.shape = shape
	collider_shape.position.y = height * 0.5
	add_child(collider_shape)
	if model_root == null:
		_build_fallback_model(length)
	if model_root != null:
		visual_motion_root = Node3D.new()
		visual_motion_root.name = "Animación procedural"
		add_child(visual_motion_root)
		visual_motion_root.add_child(model_root)
		model_root.position.y = 0.0
		if has_model:
			model_root.scale = Vector3.ONE * float(MODEL_SCALE.get(species_id, clampf(length / 7.0, 0.14, 1.4)))
			model_root.rotation.y = PI
			animation_player = _find_animation_player(model_root)
			_play_idle_animation()
		else:
			model_root.scale = Vector3.ONE * clampf(length * 0.16, 0.2, 1.2)
		var model_bounds := _collect_model_bounds(model_root, Transform3D.IDENTITY)
		if model_bounds.size.length_squared() > 0.0001:
			# Los GLB originales tienen el pivote en sitios distintos; apoya siempre la malla en el suelo.
			model_root.position.y = -model_bounds.position.y
		_setup_nameplate()
	if GameState.creature_records.has(creature_id):
		relationship = GameState.creature_records[creature_id]
	_pick_goal()

func _build_model() -> void:
	var scene := island.get_species_model(species_id)
	if scene != null:
		var instance := scene.instantiate()
		model_root = instance as Node3D
		has_model = model_root != null
	if model_root == null:
		_build_fallback_model(float(species.get("tamano", 4.0)))

func _collect_model_bounds(node: Node, parent_transform: Transform3D) -> AABB:
	var transform := parent_transform
	if node is Node3D:
		transform = parent_transform * node.transform
	var result := AABB()
	var has_bounds := false
	if node is MeshInstance3D and node.mesh != null:
		result = transform * node.get_aabb()
		has_bounds = true
	for child in node.get_children():
		var child_bounds := _collect_model_bounds(child, transform)
		if child_bounds.size.length_squared() < 0.000001:
			continue
		result = result.merge(child_bounds) if has_bounds else child_bounds
		has_bounds = true
	return result if has_bounds else AABB()

func _build_fallback_model(length: float) -> void:
	var root := Node3D.new()
	root.name = "Modelo procedural"
	var body := MeshInstance3D.new()
	var body_mesh := CapsuleMesh.new()
	body_mesh.radius = 0.65
	body_mesh.height = 2.1
	body.mesh = body_mesh
	body.position = Vector3(0, 0.9, 0)
	body.rotation.z = deg_to_rad(90.0)
	var material := StandardMaterial3D.new()
	var hash_value: int = absi(species_id.hash())
	material.albedo_color = Color.from_hsv(float(hash_value % 1000) / 1000.0, 0.48, 0.55)
	material.roughness = 0.86
	body.material_override = material
	root.add_child(body)
	for x_sign in [-1.0, 1.0]:
		for z_sign in [-1.0, 1.0]:
			var leg := MeshInstance3D.new()
			var leg_mesh := CylinderMesh.new()
			leg_mesh.top_radius = 0.14
			leg_mesh.bottom_radius = 0.22
			leg_mesh.height = 0.9
			leg.mesh = leg_mesh
			leg.position = Vector3(x_sign * 0.43, 0.38, z_sign * 0.48)
			leg.material_override = material
			root.add_child(leg)
			fallback_legs.append(leg)
	var head := MeshInstance3D.new()
	var head_mesh := SphereMesh.new()
	head_mesh.radius = 0.42
	head_mesh.height = 0.8
	head.mesh = head_mesh
	head.position = Vector3(0.0, 1.22, -0.95)
	head.scale = Vector3(0.75, 0.8, 1.5)
	head.material_override = material
	root.add_child(head)
	model_root = root

func _process(delta: float) -> void:
	if visual_motion_root == null:
		return
	visual_time += delta
	hit_reaction = move_toward(hit_reaction, 0.0, delta * 2.6)
	attack_motion = move_toward(attack_motion, 0.0, delta * 3.8)
	var horizontal_speed := Vector2(velocity.x, velocity.z).length()
	var gait := clampf(horizontal_speed / maxf(speed, 0.1), 0.0, 1.5)
	if state == "chase" or state == "flee":
		gait = maxf(gait, 0.35)
	var phase := visual_time * (5.8 if state == "chase" or state == "flee" else 4.0)
	if is_dead:
		visual_motion_root.rotation.z = move_toward(visual_motion_root.rotation.z, deg_to_rad(78.0), delta * 3.0)
		visual_motion_root.position.y = move_toward(visual_motion_root.position.y, -0.12, delta * 0.8)
	else:
		var body_bob := absf(sin(phase)) * 0.055 * gait + sin(visual_time * 1.65) * 0.012
		var lunge := sin(attack_motion * PI) * -0.12
		visual_motion_root.position.y = body_bob
		visual_motion_root.position.z = lunge + hit_reaction * 0.04
		visual_motion_root.rotation.x = sin(phase * 2.0) * 0.025 * gait - attack_motion * 0.16 + hit_reaction * 0.1
		visual_motion_root.rotation.y = sin(phase) * 0.018 * gait
		visual_motion_root.rotation.z = sin(phase) * 0.035 * gait + hit_reaction * 0.12
	for index in range(fallback_legs.size()):
		var leg := fallback_legs[index]
		if is_instance_valid(leg):
			leg.rotation.x = sin(phase + (0.0 if index % 2 == 0 else PI)) * 0.42 * gait

func _find_animation_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var found := _find_animation_player(child)
		if found != null:
			return found
	return null

func _play_idle_animation() -> void:
	if animation_player == null:
		return
	var candidates := animation_player.get_animation_list()
	for candidate in candidates:
		var name_lower := str(candidate).to_lower()
		if name_lower.contains("idle") or name_lower.contains("walk"):
			animation_player.play(candidate)
			return
	if candidates.size() > 0:
		animation_player.play(candidates[0])

func _setup_nameplate() -> void:
	name_label = Label3D.new()
	name_label.text = str(species.get("nombre", species_id))
	name_label.position.y = maxf(2.2, float(species.get("tamano", 4.0)) * 0.22)
	name_label.font_size = 32
	name_label.pixel_size = 0.003
	name_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	name_label.no_depth_test = true
	add_child(name_label)

func _physics_process(delta: float) -> void:
	if is_dead or not GameState.game_active:
		return
	state_time += delta
	think_timer -= delta
	attack_cooldown = maxf(0.0, attack_cooldown - delta)
	if think_timer <= 0.0:
		think_timer = 0.35 + randf() * 0.2
		_think()
	var direction := Vector3.ZERO
	if state == "flee" or state == "chase":
		if GameState.player_ref != null:
			direction = GameState.player_ref.global_position - global_position
			if state == "flee": direction = -direction
			direction.y = 0.0
			direction = direction.normalized()
	else:
		direction = goal - global_position
		direction.y = 0.0
		direction = direction.normalized() if direction.length_squared() > 1.0 else Vector3.ZERO
	var speed_multiplier := 1.5 if state == "flee" or state == "chase" else 1.0
	velocity.x = move_toward(velocity.x, direction.x * speed * speed_multiplier, delta * 4.0)
	velocity.z = move_toward(velocity.z, direction.z * speed * speed_multiplier, delta * 4.0)
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	else:
		velocity.y = -0.5
	move_and_slide()
	if direction.length_squared() > 0.08:
		var proposed := global_position + direction * speed * speed_multiplier * delta * 1.5
		if island.get_height(proposed.x, proposed.z) < 1.2 or island.map_data.get_normal(proposed.x, proposed.z).y < 0.82:
			direction = Vector3.ZERO
			velocity.x = move_toward(velocity.x, 0.0, delta * 8.0)
			velocity.z = move_toward(velocity.z, 0.0, delta * 8.0)
	if direction.length_squared() > 0.08:
		rotation.y = lerp_angle(rotation.y, atan2(direction.x, direction.z), delta * 3.0)
	if GameState.player_ref != null:
		var terrain_y := island.get_height(global_position.x, global_position.z)
		if global_position.y < terrain_y:
			global_position.y = terrain_y

func _think() -> void:
	if GameState.player_ref == null:
		return
	var player_pos := GameState.player_ref.global_position
	var offset := player_pos - global_position
	var distance := offset.length()
	var is_carnivore := species_id == "tyrannosaurus" or species_id == "raptor"
	var view := float(detail.get("sentidos", {}).get("vista", 40.0))
	var forward := Vector3(sin(rotation.y), 0, cos(rotation.y))
	var direction := offset.normalized()
	var in_view := distance < view and (forward.dot(direction) > -0.1 or distance < 10.0)
	if relationship.get("tamed", false):
		state = "follow" if player_pos.distance_to(global_position) > 7.0 else "rest"
		if state == "follow":
			goal = player_pos
		return
	if is_carnivore and in_view and distance < 44.0:
		state = "chase"
		if distance < 2.8 and attack_cooldown <= 0.0:
			attack_cooldown = 1.35
			attack_motion = 1.0
			var damage := 12.0 if species_id == "raptor" else 22.0
			GameState.damage(damage, str(species.get("nombre", "Criatura")))
			GameState.message("%s te ha atacado." % species.get("nombre", "Una criatura"), 1.5)
		return
	if not is_carnivore and in_view and distance < 18.0:
		state = "flee"
		return
	if distance < 11.0 and in_view:
		state = "alert"
	elif state == "flee" and distance > 35.0:
		state = "wander"
	elif state == "chase" and distance > 55.0:
		state = "wander"
	elif state == "alert" and state_time > 2.0:
		state = "wander"
	if state == "wander" and (global_position.distance_to(goal) < 2.0 or state_time > 12.0):
		_pick_goal()
	if not is_carnivore and distance < 28.0 and not Input.is_action_pressed("sprint"):
		var required := float(detail.get("doma", {}).get("hab", {}).get("seg", 150.0))
		relationship.habituation = minf(1.0, float(relationship.get("habituation", 0.0)) + 0.4 / maxf(1.0, required))
		GameState.creature_records[creature_id] = relationship

func _pick_goal() -> void:
	state = "wander"
	state_time = 0.0
	for _attempt in range(12):
		var angle := randf() * TAU
		var radius := randf_range(7.0, 24.0)
		var x := global_position.x + cos(angle) * radius
		var z := global_position.z + sin(angle) * radius
		if island._is_safe_fauna_ground(x, z):
			goal = Vector3(x, island.get_height(x, z), z)
			return
	goal = global_position

func take_hit(amount: float) -> void:
	if is_dead:
		return
	health -= maxf(1.0, amount)
	hit_reaction = 1.0
	state = "chase"
	state_time = 0.0
	if health <= 0.0:
		is_dead = true
		state = "dead"
		velocity = Vector3.ZERO
		collision_layer = 0
		collision_mask = 0
		if collider_shape != null:
			collider_shape.disabled = true
		if animation_player != null:
			animation_player.stop()
		GameState.message("%s ha caído. Usa E para despiezarlo." % species.get("nombre", species_id))
	else:
		GameState.message("%s: %d / %d" % [species.get("nombre", species_id), roundi(health), roundi(max_health)], 1.2)

func interact_with_player() -> bool:
	if is_dead:
		return _harvest_carcass()
	if GameState.current_item().is_empty() or GameState.inventory[GameState.selected_slot] == null:
		if float(relationship.get("habituation", 0.0)) >= 1.0:
			GameState.message("%s ya se ha habituado a tu presencia." % species.get("nombre", species_id))
		else:
			GameState.message("Observas a %s con calma." % species.get("nombre", species_id))
		return true
	var doma: Dictionary = detail.get("doma", {})
	var max_level := int(doma.get("max", 0))
	if max_level < 4:
		GameState.message("%s no puede domesticarse." % species.get("nombre", species_id))
		return true
	var food_table: Dictionary = doma.get("comida", {})
	var offering := GameState.current_item()
	if not food_table.has(offering):
		GameState.message("No parece interesarle ese alimento.")
		return true
	var slot = GameState.inventory[GameState.selected_slot]
	GameState._consume_slot(GameState.selected_slot)
	var max_offers := maxi(1, int(doma.get("ofrendas", 4)))
	relationship.offerings = int(relationship.get("offerings", 0)) + 1
	relationship.trust = minf(1.0, float(relationship.get("trust", 0.0)) + float(food_table[offering]))
	if float(relationship.get("habituation", 0.0)) >= 0.5 and int(relationship.offerings) >= max_offers:
		relationship.tamed = true
		GameState.message("%s confía en ti y te seguirá." % species.get("nombre", species_id))
	else:
		GameState.message("Le ofreces comida a %s (%d/%d)." % [species.get("nombre", species_id), int(relationship.offerings), max_offers])
	GameState.creature_records[creature_id] = relationship
	GameState.save_game()
	return true

func _harvest_carcass() -> bool:
	var table: Array = GameState.butchery.get(species_id, [])
	if table.is_empty():
		GameState.message("No puedes aprovechar este cadáver.")
		return true
	var tags: Array = []
	var item_id := GameState.current_item()
	if not item_id.is_empty():
		tags = GameState.items.get(item_id, {}).get("etiquetas", [])
	for entry in table:
		if randf() > float(entry.get("p", 1.0)):
			continue
		var needs: String = entry.get("req", "")
		if not needs.is_empty() and not tags.has(needs):
			continue
		var number: Array = entry.get("n", [1, 1])
		var count := randi_range(int(number[0]), int(number[1]))
		if needs.is_empty() and not tags.has("corta"):
			count = maxi(1, int(floor(float(count) * 0.5)))
		var left := GameState.add_item(str(entry.item), count)
		if left < count:
			GameState.message("Despieces %s: %s ×%d." % [species.get("nombre", species_id), GameState.items.get(entry.item, {}).get("nombre", entry.item), count - left])
			return true
	GameState.message("Necesitas una herramienta de corte para aprovechar el cadáver.")
	return true

func get_prompt() -> String:
	if is_dead:
		return "E · Despiezar %s" % species.get("nombre", species_id)
	if relationship.get("tamed", false):
		return "%s · Compañero" % species.get("nombre", species_id)
	return "E · Ofrecer comida / observar %s" % species.get("nombre", species_id)
