extends Node

var failures: Array[String] = []
var game: IslaMain

func _ready() -> void:
	call_deferred("_run")

func _run() -> void:
	game = load("res://scripts/main.gd").new()
	add_child(game)
	await get_tree().process_frame
	game.game_ui._start_new_game()
	await get_tree().create_timer(4.0).timeout
	_expect(GameState.game_active, "nueva partida activa")
	_expect(game.world.active_chunks.size() == 25, "25 sectores de terreno activos en streaming")
	_expect(game.world.fauna_root.get_child_count() == 7, "siete criaturas iniciales creadas")
	var animals_on_ground := true
	for animal_node in game.world.fauna_root.get_children():
		var animal := animal_node as IslaCreature
		var animal_ground := game.world.get_height(animal.global_position.x, animal.global_position.z)
		var body_bounds := animal._collect_model_bounds(animal.model_root, Transform3D.IDENTITY)
		var model_bottom := animal.global_position.y + animal.visual_motion_root.position.y + body_bounds.position.y
		if animal_ground <= game.world.SEA_LEVEL + 1.2 or absf(animal.global_position.y - animal_ground) > 0.55 or absf(model_bottom - animal_ground) > 0.65:
			animals_on_ground = false
	_expect(animals_on_ground, "dinosaurios terrestres aparecen sobre suelo firme")
	_expect(game.player.camera.current, "cámara de primera persona activa")
	_expect(game.game_ui.hud.visible, "HUD visible al entrar en juego")
	_expect(game.player.viewmodel != null and game.player.viewmodel.visible, "viewmodel visible en primera persona")
	_expect(game.player.viewmodel.right_hand != null and game.player.viewmodel.left_hand != null, "manos y puños de ambos lados construidos")
	_expect(game.player.viewmodel.right_arm_rig != null and game.player.viewmodel.left_arm_rig != null and game.player.viewmodel.right_arm_rig.visible and game.player.viewmodel.left_arm_rig.visible, "brazos originales visibles durante el juego sin herramienta")
	_expect(game.player.is_on_floor(), "el jugador colisiona con el terreno y permanece en la playa")
	var ground_height := game.world.get_height(game.player.global_position.x, game.player.global_position.z)
	_expect(game.player.global_position.y >= ground_height - 0.25 and game.player.global_position.y < ground_height + 0.6, "la posición física sigue el relieve")
	var creature := game.world.fauna_root.get_child(0) as IslaCreature
	_expect(creature != null and creature.visual_motion_root != null and creature.visual_time > 0.5, "fauna conectada a animación procedural")
	GameState.add_item("hacha_piedra", 1)
	var axe_slot := -1
	for i in range(GameState.inventory.size()):
		if GameState.inventory[i] != null and GameState.inventory[i].get("id", "") == "hacha_piedra":
			axe_slot = i
			break
	if axe_slot >= 0:
		GameState.selected_slot = axe_slot
	await get_tree().create_timer(0.3).timeout
	_expect(axe_slot >= 0 and game.player.viewmodel.current_tool != null and game.player.viewmodel.current_tool.visible, "modelo 3D equipado en la mano")
	var hand_before := game.player.viewmodel.right_hand.position
	game.player.viewmodel.trigger_attack("hacha_piedra")
	await get_tree().create_timer(0.12).timeout
	_expect(game.player.viewmodel.attack_time >= 0.0 and game.player.viewmodel.right_hand.position.distance_to(hand_before) > 0.01, "animación de golpe mueve el brazo con herramienta")
	var spawn_position := game.world.get_spawn()
	var ocean_position := Vector3.INF
	for offset in range(-1800, 1801, 12):
		if abs(offset) < 60:
			continue
		var sample_z := spawn_position.z + float(offset)
		if absf(sample_z) < game.world.map_data.half and game.world.get_height(spawn_position.x, sample_z) < -2.0:
			ocean_position = Vector3(spawn_position.x, 4.0, sample_z)
			break
	if ocean_position != Vector3.INF:
		game.player.global_position = ocean_position
		game.player.velocity = Vector3.ZERO
		await get_tree().create_timer(2.0).timeout
		_expect(game.player.swimming and game.player.in_water, "el jugador entra en estado de nado sobre agua profunda")
		_expect(game.player.global_position.y <= game.world.SEA_LEVEL + 0.05 and game.player.global_position.y > game.world.get_height(ocean_position.x, ocean_position.z), "flotación junto a la superficie, sin caminar por encima del mar")
		_expect(game.player.camera_pivot.global_position.y > game.world.SEA_LEVEL - 0.05, "la cámara permanece sobre la superficie al nadar")
	else:
		_expect(false, "se localiza agua profunda para validar la natación")
	game.player.global_position = spawn_position
	game.player.velocity = Vector3.ZERO
	await get_tree().create_timer(0.5).timeout
	game.game_ui.toggle_inventory()
	_expect(game.game_ui.inventory_panel.visible and game.game_ui.blocks_gameplay, "la mochila pausa el control del jugador")
	game.game_ui.handle_escape()
	_expect(not game.game_ui.inventory_panel.visible and GameState.game_active, "Escape cierra mochila y reanuda el juego")
	game.game_ui.toggle_map()
	_expect(game.game_ui.map_panel.visible, "el mapa se abre durante la partida")
	game.game_ui.handle_escape()
	_expect(not game.game_ui.map_panel.visible, "Escape cierra el mapa")
	game.game_ui.handle_escape()
	_expect(game.game_ui.pause_panel.visible, "Escape abre el menú de pausa")
	game.game_ui.handle_escape()
	_expect(not game.game_ui.pause_panel.visible and GameState.game_active, "Escape reanuda desde la pausa")
	if failures.is_empty():
		print("RUNTIME_SMOKE: PASS (23 comprobaciones de terreno, fauna apoyada, natación, viewmodel y UI)")
		GameState.game_active = false
		if game.game_ui.music != null:
			game.game_ui.music.stop()
		GameState.player_ref = null
		GameState.island_ref = null
		game.free()
		await get_tree().process_frame
		get_tree().quit(0)
	else:
		for failure in failures:
			push_error(failure)
		print("RUNTIME_SMOKE: FAIL (%d/23)" % failures.size())
		GameState.game_active = false
		if game.game_ui.music != null:
			game.game_ui.music.stop()
		GameState.player_ref = null
		GameState.island_ref = null
		game.free()
		await get_tree().process_frame
		get_tree().quit(1)

func _expect(condition: bool, label: String) -> void:
	if condition:
		print("PASS: ", label)
	else:
		failures.append(label)
