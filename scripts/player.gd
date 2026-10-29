class_name IslaPlayer
extends CharacterBody3D

const WALK_SPEED := 4.2
const SPRINT_SPEED := 7.6
const CROUCH_SPEED := 2.0
const SWIM_SPEED := 3.0
const JUMP_SPEED := 7.0
const GRAVITY := 18.0
const SENSITIVITY := 0.0022
const VIEWMODEL_SCRIPT := preload("res://scripts/player_viewmodel.gd")

var world: IslaIslandWorld
var camera_pivot: Node3D
var camera: Camera3D
var body_shape: CollisionShape3D
var yaw := 0.0
var pitch := 0.0
var head_bob := 0.0
var footsteps := 0.0
var attack_cooldown := 0.0
var crouched := false
var swimming := false
var in_water := false
var current_ui: IslaGameUI
var viewmodel: IslaPlayerViewmodel

func configure(island: IslaIslandWorld) -> void:
	world = island

func _ready() -> void:
	name = "Jugador"
	collision_layer = 1
	collision_mask = 1
	var shape := CapsuleShape3D.new()
	shape.radius = 0.35
	shape.height = 1.8
	body_shape = CollisionShape3D.new()
	body_shape.shape = shape
	body_shape.position.y = 0.9
	add_child(body_shape)
	camera_pivot = Node3D.new()
	camera_pivot.name = "CameraPivot"
	camera_pivot.position.y = 1.62
	add_child(camera_pivot)
	camera = Camera3D.new()
	camera.name = "Camera3D"
	camera.current = true
	camera.fov = 70.0
	camera.near = 0.1
	camera.far = 1100.0
	camera_pivot.add_child(camera)
	viewmodel = VIEWMODEL_SCRIPT.new()
	viewmodel.configure(self)
	camera.add_child(viewmodel)
	GameState.player_ref = self

func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED and GameState.game_active:
		apply_look(event.relative)
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED and GameState.game_active:
			attack()
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE:
			if current_ui != null:
				current_ui.handle_escape()
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_TAB:
			if current_ui != null: current_ui.toggle_inventory()
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_M:
			if current_ui != null: current_ui.toggle_map()
			get_viewport().set_input_as_handled()
		elif not GameState.game_active:
			return
		elif event.keycode == KEY_E:
			interact()
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_F:
			use_selected()
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_Z:
			GameState.is_sleeping = not GameState.is_sleeping
			GameState.message("Te has acostado. Pulsa una tecla de movimiento para levantarte." if GameState.is_sleeping else "Te has levantado.")
		elif event.keycode >= KEY_1 and event.keycode <= KEY_9:
			GameState.selected_slot = event.keycode - KEY_1
			GameState.inventory_changed.emit()
		elif event.keycode == KEY_G:
			GameState.message("No tienes una montura equipada.")

func apply_look(relative: Vector2) -> void:
	yaw -= relative.x * SENSITIVITY
	pitch = clampf(pitch - relative.y * SENSITIVITY, deg_to_rad(-85), deg_to_rad(85))
	if viewmodel != null:
		viewmodel.add_look_sway(relative)
	rotation.y = yaw
	if camera_pivot != null:
		camera_pivot.rotation.x = pitch

func _physics_process(delta: float) -> void:
	if attack_cooldown > 0.0:
		attack_cooldown -= delta
	if not GameState.game_active or GameState.dead or GameState.is_sleeping:
		velocity = Vector3.ZERO
		return
	if current_ui != null and current_ui.blocks_gameplay:
		velocity = Vector3.ZERO
		return
	var ground := world.get_height(global_position.x, global_position.z)
	var water_depth := world.SEA_LEVEL - ground
	var was_swimming := swimming
	in_water = water_depth > 0.15
	swimming = water_depth > 1.05 or (was_swimming and water_depth > 0.7)
	var input_vector := Vector2(
		Input.get_action_strength("move_right") - Input.get_action_strength("move_left"),
		Input.get_action_strength("move_back") - Input.get_action_strength("move_forward")
	)
	if input_vector.length_squared() > 1.0:
		input_vector = input_vector.normalized()
	var forward := Vector3(-sin(yaw), 0, -cos(yaw))
	var right := Vector3(cos(yaw), 0, -sin(yaw))
	var direction := (right * input_vector.x + forward * -input_vector.y).normalized()
	crouched = Input.is_action_pressed("crouch")
	var sprinting := Input.is_action_pressed("sprint") and not swimming and not crouched and float(GameState.stats.energia) > 1.0
	var speed := SWIM_SPEED if swimming else (CROUCH_SPEED if crouched else (SPRINT_SPEED if sprinting else WALK_SPEED))
	velocity.x = move_toward(velocity.x, direction.x * speed, 18.0 * delta)
	velocity.z = move_toward(velocity.z, direction.z * speed, 18.0 * delta)
	if swimming:
		var vertical_wish := float(Input.is_action_pressed("jump")) - float(Input.is_action_pressed("crouch"))
		var surface_y := world.SEA_LEVEL - 0.3
		var vertical_target := vertical_wish * 2.6
		if is_zero_approx(vertical_wish):
			vertical_target = (surface_y - global_position.y) * 3.0
			if input_vector.length_squared() > 0.01:
				vertical_target += sin(pitch) * speed * 0.55
		velocity.y = lerpf(velocity.y, vertical_target, 1.0 - exp(-4.0 * delta))
	elif not is_on_floor():
		velocity.y -= GRAVITY * delta
	elif Input.is_action_just_pressed("jump") and not crouched:
		velocity.y = JUMP_SPEED
		if viewmodel != null:
			viewmodel.trigger_jump()
	move_and_slide()
	if swimming:
		var surface_top := world.SEA_LEVEL - 0.18
		if global_position.y > surface_top:
			global_position.y = surface_top
			if velocity.y > 0.0: velocity.y = 0.0
		if global_position.y < ground + 0.3:
			global_position.y = ground + 0.3
	var moving := input_vector.length_squared() > 0.05
	if sprinting and moving:
		GameState.stats.energia = maxf(0.0, float(GameState.stats.energia) - delta * 3.2)
	else:
		GameState.stats.energia = minf(100.0, float(GameState.stats.energia) + delta * (0.9 if moving else 2.4))
	var underwater := camera_pivot.global_position.y < world.SEA_LEVEL - 0.05
	if underwater:
		GameState.stats.oxigeno = maxf(0.0, float(GameState.stats.oxigeno) - delta * 9.0)
		if float(GameState.stats.oxigeno) <= 0.0:
			GameState.damage(delta * 5.0, "Ahogamiento")
	else:
		GameState.stats.oxigeno = minf(100.0, float(GameState.stats.oxigeno) + delta * 18.0)
	if in_water:
		GameState.stats.mojado = minf(100.0, float(GameState.stats.mojado) + delta * 40.0)
	else:
		var by_fire := world != null and world.is_near_fire(global_position, 5.0)
		GameState.stats.mojado = maxf(0.0, float(GameState.stats.mojado) - delta * (4.0 if by_fire else 0.55))
	if moving and is_on_floor() and not swimming:
		head_bob += delta * (13.0 if sprinting else 9.0)
		footsteps += delta * (0.28 if sprinting else 0.42)
		if footsteps > 1.0:
			footsteps = 0.0
	else:
		head_bob = lerpf(head_bob, 0.0, delta * 6.0)
		footsteps = 0.0
	var eye_height := 0.55 if swimming else (1.15 if crouched else 1.62)
	camera_pivot.position.y = lerpf(camera_pivot.position.y, eye_height + sin(head_bob) * (0.035 if moving and not swimming else 0.0), delta * 9.0)
	if GameState.elapsed_game_time > 0.0 and int(GameState.elapsed_game_time) % 150 == 0:
		GameState.stats_changed.emit()

func is_in_water() -> bool:
	return swimming

func interact() -> void:
	if viewmodel != null:
		viewmodel.trigger_interact()
	if world.interact():
		return
	if world.nearest_creature != null:
		world.nearest_creature.interact_with_player()
	else:
		GameState.message("No hay nada al alcance.")

func use_selected() -> void:
	if world == null:
		return
	var item_id := GameState.current_item()
	if item_id.is_empty():
		return
	if viewmodel != null:
		viewmodel.trigger_attack(item_id)
	var def: Dictionary = GameState.items.get(item_id, {})
	if item_id == "fogata" or def.has("pieza"):
		var target := global_position - Vector3(sin(yaw), 0, cos(yaw)) * 2.2
		target.y = world.get_height(target.x, target.z)
		if target.distance_to(global_position) > 3.0:
			return
		if world.map_data.get_normal(target.x, target.z).y < 0.85:
			GameState.message("El terreno está demasiado inclinado.")
			return
		if world.place_selected_object(target, yaw):
			GameState.message("Has colocado %s." % def.get("nombre", item_id))
		return
	if not GameState.use_selected():
		GameState.message("No puedes usar ese objeto ahora.")

func attack() -> void:
	if attack_cooldown > 0.0 or not GameState.game_active or current_ui != null and current_ui.blocks_gameplay:
		return
	attack_cooldown = 0.38
	if viewmodel != null:
		viewmodel.trigger_attack(GameState.current_item())
	var from := camera.global_position
	var to := from + -camera.global_transform.basis.z * 3.2
	var query := PhysicsRayQueryParameters3D.create(from, to)
	query.exclude = [get_rid()]
	query.collide_with_areas = false
	var hit := get_world_3d().direct_space_state.intersect_ray(query)
	if not hit.is_empty():
		var collider: Object = hit.get("collider")
		if collider is IslaCreature:
			var damage := 5.0
			var item_id := GameState.current_item()
			if not item_id.is_empty():
				var def: Dictionary = GameState.items.get(item_id, {})
				damage = float(def.get("dano", 6.0))
				var slot = GameState.inventory[GameState.selected_slot]
				if slot != null and slot.has("durability"):
					slot.durability = int(slot.durability) - 1
					if int(slot.durability) <= 0:
						GameState.inventory[GameState.selected_slot] = null
						GameState.message("Tu herramienta se ha roto.")
			collider.take_hit(damage)
			GameState.inventory_changed.emit()
			return
	if not world.attack_target():
		GameState.message("Golpeas el aire.", 0.7)
