@testable import App
import XCTVapor

final class MemberTests: XCTestCase {
    private func borrow(
        _ app: Application,
        gameID: UUID,
        memberID: UUID,
        afterResponse: (XCTHTTPResponse) async throws -> Void
    ) async throws {
        try await app.test(.POST, "loans", beforeRequest: { req in
            try req.content.encode(CreateLoanDTO(gameID: gameID, memberID: memberID))
        }, afterResponse: afterResponse)
    }
    
    func testCreateMemberReturnsCreated() async throws {
        try await withApp { app in
            try await app.test(.POST, "members", beforeRequest: { req in
                try req.content.encode(CreateMemberDTO(name: "Camille", email: "camille@example.com"))
            }, afterResponse: { res async throws in
                XCTAssertEqual(res.status, .created)
                XCTAssertEqual(try res.content.decode(MemberDTO.self).name, "Camille")
            })
        }
    }

    func testCreateMemberWithInvalidEmailIsRejected() async throws {
        try await withApp { app in
            try await app.test(.POST, "members", beforeRequest: { req in
                try req.content.encode(CreateMemberDTO(name: "Camille", email: "not-an-email"))
            }, afterResponse: { res async throws in
                XCTAssertEqual(res.status, .badRequest)
            })
        }
    }

    func testCreateMemberWithDuplicateEmailReturnsConflict() async throws {
        try await withApp { app in
            _ = try await createMember(app)

            try await app.test(.POST, "members", beforeRequest: { req in
                try req.content.encode(CreateMemberDTO(name: "Autre", email: "camille@example.com"))
            }, afterResponse: { res async throws in
                XCTAssertEqual(res.status, .conflict)
            })
        }
    }
    
    func testUpdateMemberReturnsMemberWithOk() async throws {
        try await withApp { app in
            let member = try await createMember(app)
            let id = try XCTUnwrap(member.id)

            try await app.test(.PUT, "members/\(id)", beforeRequest: { req in
                try req.content.encode(UpdateMemberDTO(name: "Autre", email: "camille@example.com"))
            }, afterResponse: { res async throws in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(MemberDTO.self).name, "Autre")
            })
        }
    }
    
    func testUpdateMemberWithDuplicateEmailReturnsConflict() async throws {
        try await withApp { app in
            let member1 = try await createMember(app, name: "Camille", email: "camille@example.com")
            let member1ID = try XCTUnwrap(member1.id)
            _ = try await createMember(app, name: "Autre", email: "autre@example.com")

            try await app.test(.PUT, "members/\(member1ID)", beforeRequest: { req in
                try req.content.encode(UpdateMemberDTO(name: "Camille", email: "autre@example.com"))
            }, afterResponse: { res async throws in
                XCTAssertEqual(res.status, .conflict)
            })
        }
    }
    
    func testDeleteMemberReturnNoContent() async throws {
        try await withApp { app in
            let member = try await createMember(app)
            let id = try XCTUnwrap(member.id)

            try await app.test(.DELETE, "members/\(id)", afterResponse: { res async throws in
                XCTAssertEqual(res.status, .noContent)
            })
        }
    }
    
    func testDeleteMemberWithLoansIsRejected() async throws {
        try await withApp { app in
            let member = try await createMember(app)
            let game = try await createGame(app)

            let memberID = try XCTUnwrap(member.id)
            let gameID = try XCTUnwrap(game.id)

            try await borrow(app, gameID: gameID, memberID: memberID) { res in
                XCTAssertEqual(res.status, .created)
            }

            try await app.test(.DELETE, "members/\(memberID)", afterResponse: { res async throws in
                XCTAssertEqual(res.status, .conflict)
            })
        }
    }

    func testShowUnknownMemberReturnsNotFound() async throws {
        try await withApp { app in
            try await app.test(.GET, "members/\(UUID())", afterResponse: { res async throws in
                XCTAssertEqual(res.status, .notFound)
            })
        }
    }
}
