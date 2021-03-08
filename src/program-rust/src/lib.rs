use byteorder::{ByteOrder, LittleEndian};
use arrayref::array_mut_ref;
use num_derive::FromPrimitive;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use std::mem;
use thiserror::Error;
use std::str::from_utf8;


#[derive(Clone, Debug, Eq, Error, FromPrimitive, PartialEq)]
pub enum MessageFeedError {
    #[error("User is banned")]
    BannedUser,
    #[error("Next message already exists")]
    NextMessageExists,
    #[error("Creator mismatch")]
    CreatorMismatch,
}
impl From<MessageFeedError> for ProgramError {
    fn from(e: MessageFeedError) -> Self {
        ProgramError::CustomError(e as u32)
    }
}
impl<T> DecodeError<T> for MessageFeedError {
    fn type_of() -> &'static str {
        "MessageFeedError"
    }
}

type PubkeyData = [u8; 32];

struct UserAccountData<'a> {
    pub banned: &'a mut bool,
    pub creator: &'a mut PubkeyData,
}
impl<'a> UserAccountData<'a> {
    fn new(data: &'a mut [u8]) -> Self {
        let (banned, creator) = data.split_at_mut(1);
        Self {
            banned: unsafe { &mut *(&mut banned[0] as *mut u8 as *mut bool) },
            creator: array_mut_ref!(creator, 0, size_of::<PubkeyData>()),
        }
    }
}

struct MessageAccountData<'a> {
    pub next_message: &'a mut PubkeyData,
    pub from: &'a mut PubkeyData,
    pub creator: &'a mut PubkeyData,
    pub text: &'a mut [u8],
}
impl<'a> MessageAccountData<'a> {
    fn new(data: &'a mut [u8]) -> Self {
        let (next_message, rest) = data.split_at_mut(size_of::<PubkeyData>());
        let (from, rest) = rest.split_at_mut(size_of::<PubkeyData>());
        let (creator, text) = rest.split_at_mut(size_of::<PubkeyData>());
        Self {
            next_message: array_mut_ref!(next_message, 0, size_of::<PubkeyData>()),
            from: array_mut_ref!(from, 0, size_of::<PubkeyData>()),
            creator: array_mut_ref!(creator, 0, size_of::<PubkeyData>()),
            text,
        }
    }
}


// Declare and export the program's entrypoint
entrypoint!(process_instruction);

// Program entrypoint's implementation
fn process_instruction(
    program_id: &Pubkey, // Public key of the account the hello world program was loaded into
    accounts: &[AccountInfo], // The account to say hello to
    input: &[u8], // Ignored, all helloworld instructions are hellos
) -> ProgramResult {
    msg!("Helloworld Rust program entrypoint");

    // Iterating accounts is safer then indexing
    let accounts_iter = &mut accounts.iter();

    // Get the account to say hello to
    let account = next_account_info(accounts_iter)?;

    // The account must be owned by the program in order to modify its data
    if account.owner != program_id {
        msg!("Greeted account does not have the correct program id");
        return Err(ProgramError::IncorrectProgramId);
    }

    // The data must be large enough to hold a u32 count
    if account.try_data_len()? < mem::size_of::<u32>() {
        msg!("Greeted account data length too small for u32");
        return Err(ProgramError::InvalidAccountData);
    }

    let mesg = from_utf8(input).map_err(|err| {
        msg!("Invalid UTF-8, from byte {}", err.valid_up_to());
        ProgramError::InvalidInstructionData
    })?;
    msg!("Received message (len {}): {:?}", mesg.len(), mesg);

    // Increment and store the number of times the account has been greeted
    let mut data = account.try_borrow_mut_data()?;
    let mut num_greets = LittleEndian::read_u32(&data);
    num_greets += 1;
    LittleEndian::write_u32(&mut data[0..], num_greets);

    msg!("Hello!");

    Ok(())
}

// Sanity tests
#[cfg(test)]
mod test {
    use super::*;
    use solana_program::clock::Epoch;

    #[test]
    fn test_sanity() {
        let program_id = Pubkey::default();
        let key = Pubkey::default();
        let mut lamports = 0;
        let mut data = vec![0; mem::size_of::<u32>()];
        LittleEndian::write_u32(&mut data, 0);
        let owner = Pubkey::default();
        let account = AccountInfo::new(
            &key,
            false,
            true,
            &mut lamports,
            &mut data,
            &owner,
            false,
            Epoch::default(),
        );
        let instruction_data: Vec<u8> = Vec::new();

        let accounts = vec![account];

        assert_eq!(LittleEndian::read_u32(&accounts[0].data.borrow()), 0);
        process_instruction(&program_id, &accounts, &instruction_data).unwrap();
        assert_eq!(LittleEndian::read_u32(&accounts[0].data.borrow()), 1);
        process_instruction(&program_id, &accounts, &instruction_data).unwrap();
        assert_eq!(LittleEndian::read_u32(&accounts[0].data.borrow()), 2);
    }
}
