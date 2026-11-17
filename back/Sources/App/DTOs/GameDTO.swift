import Vapor

struct GameDTO: Content {
    let id: UUID?
    let title: String
    let minPlayers: Int
    let maxPlayers: Int
    let durationMinutes: Int
    let isAvailable: Bool
}

struct GameWithLoanIdDTO: Content {
    let id: UUID?
    let title: String
    let minPlayers: Int
    let maxPlayers: Int
    let durationMinutes: Int
    let isAvailable: Bool
    let loanID: UUID?
}

extension Game {
    func toDTO() -> GameDTO {
        GameDTO(
            id: id,
            title: title,
            minPlayers: minPlayers,
            maxPlayers: maxPlayers,
            durationMinutes: durationMinutes,
            isAvailable: isAvailable
        )
    }
    
    func toGameWithLoanIdDTO() -> GameWithLoanIdDTO {
        GameWithLoanIdDTO(
            id: id,
            title: title,
            minPlayers: minPlayers,
            maxPlayers: maxPlayers,
            durationMinutes: durationMinutes,
            isAvailable: isAvailable,
            loanID: self.loans.first(where: {$0.returnedAt == nil})?.id
        )
    }
}
