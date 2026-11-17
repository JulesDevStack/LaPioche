import Fluent
import Vapor

struct LoanController: RouteCollection {
    func boot(routes: any RoutesBuilder) throws {
        let loans = routes.grouped("loans")
        loans.post(use: create)
        loans.post(":id", "return", use: update)
    }

    @Sendable
    func create(req: Request) async throws -> Response {
        let dto = try req.content.decode(CreateLoanDTO.self)

        guard let game = try await Game.find(dto.gameID, on: req.db) else {
            throw Abort(.notFound, reason: "Game not found")
        }
        guard let member = try await Member.find(dto.memberID, on: req.db) else {
            throw Abort(.notFound, reason: "Member not found")
        }
        
        //check if game is already loaned
        let gameID = try game.requireID()
        let alreadyLoaned = try await Loan
            .query(on: req.db)
            .filter(\.$game.$id == gameID)
            .filter(\.$returnedAt == nil)
            .first()

        guard alreadyLoaned == nil else {
            throw Abort(.conflict, reason: "Game is already loaned")
        }
        
        let now = Date()
        let loan = Loan(
            gameID: try game.requireID(),
            memberID: try member.requireID(),
            borrowedAt: now,
            dueAt: try Loan.dueDate(from: now)
        )
        try await loan.save(on: req.db)
        return try await loan.toDTO().encodeResponse(status: .created, for: req)
    }
    
    @Sendable
    func update(req: Request) async throws -> Response {
        guard let loan = try await Loan.find(req.parameters.get("id"), on: req.db) else {
            throw Abort(.notFound, reason: "Loan not found")
        }
        
        if loan.returnedAt != nil {
            throw Abort(.conflict, reason: "Loan is already returned")
        }
        
        loan.returnedAt = .now
        
        try await loan.update(on: req.db)
        
        return Response(status: .ok)
    }
}
