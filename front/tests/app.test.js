import {assertEqual, assertIncludes, assertTrue, test, waitFor} from "./runner.js";
import {mountApp} from "./helpers.js";

const catan = {id: "g1", title: "Catan", minPlayers: 3, maxPlayers: 4, durationMinutes: 90, isAvailable: true};
const dixit = {id: "g2", title: "Dixit", minPlayers: 3, maxPlayers: 6, durationMinutes: 30, isAvailable: false};
const camille = {id: "m1", name: "Camille", email: "camille@example.com"};

const cardOf = (app, title) => app.$$("#games-list .card").find((card) => card.querySelector("h3").textContent === title);

// --- Jeux

test("games list shows one card per game with its availability", async () => {
	const app = await mountApp({"GET /games": [catan, dixit]});
	await waitFor(() => app.$$("#games-list .card").length === 2, "deux cartes de jeu");
	assertIncludes(cardOf(app, "Catan").textContent, "Disponible");
	assertIncludes(cardOf(app, "Dixit").textContent, "Emprunté");
	assertIncludes(cardOf(app, "Catan").textContent, "3 à 4 joueur·ses · 90 min");
});

test("only an available game offers Borrow", async () => {
	const app = await mountApp({"GET /games": [catan, dixit]});
	await waitFor(() => app.$$("#games-list .card").length === 2);
	const labels = (title) => [...cardOf(app, title).querySelectorAll("button")].map((button) => button.textContent);
	assertTrue(labels("Catan").includes("Emprunter"), "Catan devrait proposer Emprunter");
	assertTrue(!labels("Dixit").includes("Emprunter"), "Dixit est emprunté, il ne doit pas proposer Emprunter");
});

test("with no game, a message invites to add one", async () => {
	const app = await mountApp({"GET /games": []});
	await waitFor(() => !app.$("#games-empty").hidden);
	assertIncludes(app.$("#games-empty").textContent, "ne contient aucun jeu");
	assertIncludes(app.$("#games-empty").textContent, "Ajouter un jeu");
});

test("adding a game posts the form then reloads the list", async () => {
	const app = await mountApp({"GET /games": [catan], "POST /games": [201, {...catan, id: "g3", title: "Dixit"}]});
	await waitFor(() => app.$$("#games-list .card").length === 1);
	app.click("Ajouter un jeu");
	const form = app.$("#game-form");
	form.elements.title.value = "  Dixit ";
	form.elements.minPlayers.value = "3";
	form.elements.maxPlayers.value = "6";
	form.elements.durationMinutes.value = "30";
	form.requestSubmit();
	await waitFor(() => app.calls.some((call) => call.method === "POST" && call.path === "/games"), "l'appel POST /games");
	assertEqual(app.calls.find((call) => call.method === "POST").body, {
		title: "Dixit",
		minPlayers: 3,
		maxPlayers: 6,
		durationMinutes: 30,
	});
	await waitFor(() => !app.$("#game-dialog").open, "la boîte se ferme");
});

test("a validation error is shown in French and the dialog stays open", async () => {
	const app = await mountApp({
		"GET /games": [],
		"POST /games": [400, {error: true, reason: "title is empty, durationMinutes is less than minimum of 1"}],
	});
	await waitFor(() => !app.$("#games-empty").hidden, "la page est chargée");
	app.click("Ajouter un jeu");
	app.$("#game-form").requestSubmit();
	await waitFor(() => !app.$("#game-dialog .form-error").hidden, "le message d'erreur");
	assertEqual(app.$("#game-dialog .form-error").textContent, "Le titre est obligatoire. La durée doit être d'au moins 1.");
	assertTrue(app.$("#game-dialog").open, "la boîte devrait rester ouverte");
});

test("delete a game posts the form then reloads the list", async () => {
	let games = [catan];

	const app = await mountApp({
		"GET /games": () => games,
		[`DELETE /games/${catan.id}`]: () => {
			games = games.filter(game => game.id !== catan.id);
			return [204];
		}
	});

	await waitFor(() => app.$$("#games-list .card").length === 1);

	app.click("Supprimer");
	app.click("Supprimer ce jeu !");

	await waitFor(() => app.calls.some(
		call => call.method === "DELETE" && call.path === `/games/${catan.id}`
	), "DELETE /games/:id");

	await waitFor(() => app.calls.filter(
		call => call.method === "GET" && call.path === "/games"
	).length >= 2, "rechargement de la liste");

	await waitFor(() => app.$$("#games-list .card").length === 0);

	assertIncludes(
		app.$("#games-empty").textContent,
		"ne contient aucun jeu"
	);
});

test("updating a game modifies it and reloads the list", async () => {
	let games = [catan];

	const app = await mountApp({
		"GET /games": () => games,
		[`PUT /games/${catan.id}`]: ({body}) => {
			games = games.map((game) => {
				if (game.id === catan.id) {
					return {
						...game,
						...body
					}
				} else {
					return game
				}
			});

			return [200, games.find(game => game.id === catan.id)];
		}
	});

	await waitFor(() => app.$$("#games-list .card").length === 1);

	app.click("Modifier");

	const form = app.$("#game-update-form");

	await waitFor(
		() => form.elements.title.value === catan.title,
		"remplissage du formulaire"
	);

	form.elements.title.value = "Dixit";
	form.elements.minPlayers.value = "1";
	form.elements.maxPlayers.value = "2";
	form.elements.durationMinutes.value = "111";

	form.requestSubmit();

	await waitFor(() => app.calls.some(
		call => call.method === "PUT" && call.path === `/games/${catan.id}`
	), "l'appel PUT /games/:id");

	assertEqual(app.calls.find(call => call.method === "PUT").body, {
		id: catan.id,
		title: "Dixit",
		minPlayers: 1,
		maxPlayers: 2,
		durationMinutes: 111
	});

	await waitFor(() => !app.$("#game-dialog").open, "la boîte se ferme");

	await waitFor(() => app.calls.filter(
		call => call.method === "GET" && call.path === "/games"
	).length >= 2, "le rechargement de la liste");

	await waitFor(() => app.$$("#games-list .card").length === 1);

	await waitFor(() => app.$("#games-list .card").textContent.includes("Dixit"));
});

// --- Emprunts

test("borrowing a game sends the game and the chosen member", async () => {
	const app = await mountApp({
		"GET /games": [catan],
		"GET /members": [camille],
		"POST /loans": [201, {
			id: "l1",
			gameID: "g1",
			memberID: "m1",
			borrowedAt: new Date().toISOString(),
			dueAt: new Date().toISOString()
		}],
	});
	await waitFor(() => app.$$("#games-list .card").length === 1);
	app.click("Emprunter", cardOf(app, "Catan"));
	await waitFor(() => app.$("#borrow-dialog").open, "la boîte d'emprunt");
	app.$("#borrow-form").requestSubmit();
	await waitFor(() => app.calls.some((call) => call.method === "POST" && call.path === "/loans"), "l'appel POST /loans");
	assertEqual(app.calls.find((call) => call.path === "/loans").body, {gameID: "g1", memberID: "m1"});
	await waitFor(() => app.$("#toasts").textContent.includes("emprunté"), "le message de confirmation");
});

test("borrowing without any member explains that one must be added first", async () => {
	const app = await mountApp({"GET /games": [catan], "GET /members": []});
	await waitFor(() => app.$$("#games-list .card").length === 1);
	app.click("Emprunter", cardOf(app, "Catan"));
	await waitFor(() => app.$("#toasts").textContent.includes("Ajoutez d'abord"), "le message d'aide");
	assertTrue(!app.$("#borrow-dialog").open, "la boîte d'emprunt ne doit pas s'ouvrir");
});

test("returning a game posts the form", async () => {
	const borrowedGame = {...dixit, loanID: "l1"};
	let games = [borrowedGame];

	const app = await mountApp({
		"GET /games": () => games,
		[`POST /loans/${borrowedGame.loanID}/return`]: () => {
			games = games.map(game => {
				if (game.id === borrowedGame.id) {
					return {
						...game,
						isAvailable: true,
						loanID: null
					};
				} else {
					return game;
				}
			});

			return [204];
		}
	});

	await waitFor(() => app.$$("#games-list .card").length === 1);

	app.click("Rendre", cardOf(app, borrowedGame.title));

	await waitFor(
		() => app.$("#update-loan-dialog").open,
		"ouverture de la boîte de retour"
	);

	app.click("Rendre le jeu", app.$("#update-loan-dialog"));

	await waitFor(() => app.calls.some(
		call => call.method === "POST" &&
			call.path === `/loans/${borrowedGame.loanID}/return`
	), "l'appel POST /loans/:id/return");

	await waitFor(
		() => !app.$("#update-loan-dialog").open,
		"la boîte se ferme"
	);

	await waitFor(() => app.calls.filter(
		call => call.method === "GET" && call.path === "/games"
	).length >= 2, "le rechargement de la liste");

	await waitFor(() =>
		cardOf(app, borrowedGame.title)?.textContent.includes("Disponible")
	);

	assertTrue(
		[...cardOf(app, borrowedGame.title).querySelectorAll("button")]
			.some(button => button.textContent === "Emprunter")
	);

	await waitFor(() =>
			app.$("#toasts").textContent.includes("Jeu de nouveau disponible"),
		"le message de confirmation"
	);
});

// --- Adhérent·es

test("members tab lists the members", async () => {
	const app = await mountApp({"GET /members": [camille]}, {hash: "#members"});
	await waitFor(() => app.$$("#members-list .row").length === 1);
	assertIncludes(app.$("#members-list .row").textContent, "Camille");
	assertIncludes(app.$("#members-list .row").textContent, "camille@example.com");
});

test("with no member, a message invites to add one", async () => {
	const app = await mountApp({"GET /members": []}, {hash: "#members"});
	await waitFor(() => !app.$("#members-empty").hidden);
	assertIncludes(app.$("#members-empty").textContent, "Aucun·e adhérent·e pour le moment. Cliquez sur « Ajouter un·e\n" +
		"\t\t\tadhérent·e » pour créer le premier ou la première.");
});

test("adding a member posts the form", async () => {
	const app = await mountApp({"GET /members": [], "POST /members": [201, camille]}, {hash: "#members"});
	await waitFor(() => !app.$("#members-empty").hidden);
	app.click("Ajouter un·e adhérent·e");
	const form = app.$("#member-form");
	form.elements.name.value = " Camille ";
	form.elements.email.value = "camille@example.com";
	form.requestSubmit();
	await waitFor(() => app.calls.some((call) => call.method === "POST" && call.path === "/members"), "l'appel POST /members");
	assertEqual(app.calls.find((call) => call.method === "POST").body, {name: "Camille", email: "camille@example.com"});
});

test("an email already in use is shown in French", async () => {
	const app = await mountApp(
		{"GET /members": [], "POST /members": [409, {error: true, reason: "A member with this email already exists"}]},
		{hash: "#members"},
	);
	await waitFor(() => !app.$("#members-empty").hidden);
	app.click("Ajouter un·e adhérent·e");
	app.$("#member-form").requestSubmit();
	await waitFor(() => !app.$("#member-dialog .form-error").hidden, "le message d'erreur");
	assertIncludes(app.$("#member-dialog .form-error").textContent, "utilise déjà cette adresse e-mail");
});

test("updating a member posts the form then reloads the list", async () => {
	let members = [camille];

	const app = await mountApp({
		"GET /members": () => members,
		[`PUT /members/${camille.id}`]: ({body}) => {
			members = members.map((member) => {
				if (member.id === camille.id) {
					return {
						...member,
						...body
					};
				} else {
					return member;
				}
			});

			return [200, members.find(member => member.id === camille.id)];
		}
	}, {hash: "#members"});

	await waitFor(() => app.$$("#members-list .row").length === 1);

	app.click("Modifier");

	const form = app.$("#member-update-form");

	await waitFor(
		() => form.elements.name.value === camille.name,
		"remplissage du formulaire"
	);

	form.elements.name.value = "Camille2";
	form.elements.email.value = camille.email;

	form.requestSubmit();

	await waitFor(() => app.calls.some(
		call => call.method === "PUT" && call.path === `/members/${camille.id}`
	), "l'appel PUT /members/:id");

	assertEqual(app.calls.find(call => call.method === "PUT").body, {
		id: camille.id,
		name: "Camille2",
		email: camille.email
	});

	await waitFor(() => !app.$("#member-update-dialog").open, "la boîte se ferme");

	await waitFor(() => app.calls.filter(
		call => call.method === "GET" && call.path === "/members"
	).length >= 2, "le rechargement de la liste");

	await waitFor(() => app.$$("#members-list .row").length === 1);

	await waitFor(() => app.$("#members-list .row").textContent.includes("Camille2"));

	assertIncludes(app.$("#members-list .row").textContent, "Camille2");
});

test("delete a member posts the form then reloads the list", async () => {
	let members = [camille];

	const app = await mountApp({
		"GET /members": () => members,
		[`DELETE /members/${camille.id}`]: () => {
			members = members.filter(member => member.id !== camille.id);
			return [204];
		}
	}, {hash: "#members"});

	await waitFor(() => app.$$("#members-list .row").length === 1);

	app.click("Supprimer");
	app.click("Supprimer cet·te adhérent·e !");

	await waitFor(() => app.calls.some(
		call => call.method === "DELETE" && call.path === `/members/${camille.id}`
	), "DELETE /members/:id");

	await waitFor(() => app.calls.filter(
		call => call.method === "GET" && call.path === "/members"
	).length >= 2, "rechargement de la liste");

	await waitFor(() => app.$$("#members-list .row").length === 0);

	await waitFor(() => !app.$("#members-empty").hidden);

	assertIncludes(
		app.$("#members-empty").textContent,
		"Aucun·e adhérent·e pour le moment."
	);
});

test("showing an active loan for a member", async () => {
	const loan = {
		id: "l1",
		gameID: catan.id,
		gameName: catan.title,
		memberID: camille.id,
		borrowedAt: new Date().toISOString(),
		dueAt: new Date(Date.now() + 86400000 * 14).toISOString()
	};

	const app = await mountApp({
		"GET /members": [camille],
		[`GET /members/${camille.id}/loans`]: [loan]
	}, {hash: "#members"});

	await waitFor(() => app.$$("#members-list .row").length === 1);

	app.click("Voir les emprunts", app.$("#members-list .row"));

	await waitFor(() => app.calls.some(
		call => call.method === "GET" &&
			call.path === `/members/${camille.id}/loans`
	), "GET /members/:id/loans");

	await waitFor(() => app.$("#loans-dialog").open);

	assertEqual(
		app.$("#loans-dialog-title").textContent,
		`Emprunt(s) de ${camille.name}`
	);

	assertEqual(app.$$("#loans-list-dialog .row").length, 1);

	const row = app.$("#loans-list-dialog .row");

	assertIncludes(row.textContent, `Jeu : ${loan.gameName}`);
	assertEqual(row.querySelector(".status").textContent, "En cours");
});

test("showing an overdue loan for a member", async () => {
	const loan = {
		id: "l1",
		gameID: catan.id,
		gameName: catan.title,
		memberID: camille.id,
		borrowedAt: new Date(Date.now() - 86400000 * 20).toISOString(),
		dueAt: new Date(Date.now() - 86400000 * 6).toISOString()
	};

	const app = await mountApp({
		"GET /members": [camille],
		[`GET /members/${camille.id}/loans`]: [loan]
	}, {hash: "#members"});

	await waitFor(() => app.$$("#members-list .row").length === 1);

	app.click("Voir les emprunts", app.$("#members-list .row"));

	await waitFor(() => app.calls.some(
		call => call.method === "GET" &&
			call.path === `/members/${camille.id}/loans`
	), "GET /members/:id/loans");

	await waitFor(() => app.$("#loans-dialog").open);

	assertEqual(
		app.$("#loans-dialog-title").textContent,
		`Emprunt(s) de ${camille.name}`
	);

	assertEqual(app.$$("#loans-list-dialog .row").length, 1);

	const row = app.$("#loans-list-dialog .row");

	assertIncludes(row.textContent, `Jeu : ${loan.gameName}`);
	assertEqual(row.querySelector(".status").textContent, "En retard");
});

test("showing a returned loan for a member", async () => {
	const loan = {
		id: "l1",
		gameID: catan.id,
		gameName: catan.title,
		memberID: camille.id,
		borrowedAt: new Date(Date.now() - 86400000 * 20).toISOString(),
		dueAt: new Date(Date.now() - 86400000 * 6).toISOString(),
		returnedAt: new Date().toISOString()
	};

	const app = await mountApp({
		"GET /members": [camille],
		[`GET /members/${camille.id}/loans`]: [loan]
	}, {hash: "#members"});

	await waitFor(() => app.$$("#members-list .row").length === 1);

	app.click("Voir les emprunts", app.$("#members-list .row"));

	await waitFor(() => app.calls.some(
		call => call.method === "GET" &&
			call.path === `/members/${camille.id}/loans`
	), "GET /members/:id/loans");

	await waitFor(() => app.$("#loans-dialog").open);

	assertEqual(
		app.$("#loans-dialog-title").textContent,
		`Emprunt(s) de ${camille.name}`
	);

	assertEqual(app.$$("#loans-list-dialog .row").length, 1);

	const row = app.$("#loans-list-dialog .row");

	const returnedDate = new Intl.DateTimeFormat("fr-FR", {
		dateStyle: "long"
	}).format(new Date(loan.returnedAt));

	assertIncludes(row.textContent, `Jeu : ${loan.gameName}`);
	assertEqual(
		row.querySelector(".status").textContent,
		`Rendu le ${returnedDate}`
	);
});

test("showing loans for a member without any loan displays a message", async () => {
	const app = await mountApp({
		"GET /members": [camille],
		[`GET /members/${camille.id}/loans`]: []
	}, {hash: "#members"});

	await waitFor(() => app.$$("#members-list .row").length === 1);

	app.click("Voir les emprunts", app.$("#members-list .row"));

	await waitFor(() => app.calls.some(
		call => call.method === "GET" &&
			call.path === `/members/${camille.id}/loans`
	), "GET /members/:id/loans");

	await waitFor(() =>
		app.$("#toasts").textContent.includes("Aucun emprunt pour ce membre.")
	);

	assertTrue(
		!app.$("#loans-dialog").open,
		"la boîte des emprunts ne doit pas s'ouvrir"
	);
});