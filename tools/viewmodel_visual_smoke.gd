extends Node

## Ejecutable con ventana para revisar visualmente manos, brazos y dos herramientas.

var game: IslaMain

func _ready() -> void:
	call_deferred("_run")

func _run() -> void:
	var hands_scene := load("res://assets/godot_models/player/original_hands.glb") as PackedScene
	if hands_scene != null:
		var hands_instance := hands_scene.instantiate()
		_print_tree(hands_instance, "")
		hands_instance.free()
	game = load("res://scripts/main.gd").new() as IslaMain
	add_child(game)
	await get_tree().process_frame
	game.game_ui._start_new_game()
	await get_tree().create_timer(0.6).timeout
	await _capture("/tmp/isla-viewmodel-punos.png")
	_equip_for_capture("hacha_piedra")
	await get_tree().create_timer(2.0).timeout
	_report_pose("hacha_piedra")
	await _capture("/tmp/isla-viewmodel-hacha.png")
	_equip_for_capture("lanza")
	await get_tree().create_timer(0.6).timeout
	_report_pose("lanza")
	await _capture("/tmp/isla-viewmodel-lanza.png")
	game.player.viewmodel.trigger_attack("lanza")
	await get_tree().create_timer(0.14).timeout
	await _capture("/tmp/isla-viewmodel-lanza-golpe.png")
	print("VIEWMODEL_VISUAL_SMOKE: capturas guardadas en /tmp/isla-viewmodel-*.png")
	GameState.game_active = false
	if game.game_ui.music != null:
		game.game_ui.music.stop()
	GameState.player_ref = null
	GameState.island_ref = null
	game.free()
	await get_tree().process_frame
	get_tree().quit(0)

func _equip_for_capture(item_id: String) -> void:
	GameState.add_item(item_id, 1)
	for i in range(GameState.inventory.size()):
		if GameState.inventory[i] != null and GameState.inventory[i].get("id", "") == item_id:
			GameState.selected_slot = i
			break
	GameState.inventory_changed.emit()

func _report_pose(expected_item: String) -> void:
	var viewmodel := game.player.viewmodel
	print("VIEWMODEL_POSE: esperado=", expected_item, " slot=", GameState.selected_slot, " actual=", GameState.current_item(), " tool=", viewmodel.equipped_id, " modelo=", viewmodel.current_tool != null, " visible=", viewmodel.current_tool.visible if viewmodel.current_tool != null else false, " mano=", viewmodel.right_hand.position, " kick=", viewmodel.jump_kick, "/", viewmodel.jump_velocity, " floor=", game.player.is_on_floor(), " mount=", viewmodel.tool_mount.position)

func _capture(path: String) -> void:
	await get_tree().process_frame
	get_viewport().get_texture().get_image().save_png(path)

func _print_tree(node: Node, prefix: String) -> void:
	if node is MeshInstance3D:
		print("ORIGINAL_RIG_NODE: ", prefix, node.name, " mesh=", node.mesh.get_class() if node.mesh != null else "none")
	else:
		print("ORIGINAL_RIG_NODE: ", prefix, node.name, " class=", node.get_class())
	for child in node.get_children():
		_print_tree(child, prefix + "  ")
