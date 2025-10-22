/**
 * @swagger
 * components:
 *   schemas:
 *     Error:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: "Error message"
 *     
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         email:
 *           type: string
 *           format: email
 *           example: "user@example.com"
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2023-01-01T00:00:00.000Z"
 *     
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: "user@example.com"
 *         password:
 *           type: string
 *           format: password
 *           example: "securepassword"
 *     
 *     LoginResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             user:
 *               $ref: '#/components/schemas/User'
 *     
 *     MfaRequiredResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         mfaRequired:
 *           type: boolean
 *           example: true
 *         factors:
 *           type: array
 *           items:
 *             type: object
 *         userId:
 *           type: string
 *           format: uuid
 *     
 *     SignupRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - firstName
 *         - lastName
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: "newuser@example.com"
 *         password:
 *           type: string
 *           format: password
 *           example: "securepassword"
 *         firstName:
 *           type: string
 *           example: "John"
 *         lastName:
 *           type: string
 *           example: "Doe"
 *     
 *     SignupResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             user:
 *               $ref: '#/components/schemas/User'
 *     
 *     ResetPasswordRequest:
 *       type: object
 *       required:
 *         - email
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: "user@example.com"
 *     
 *     UpdatePasswordRequest:
 *       type: object
 *       required:
 *         - password
 *       properties:
 *         password:
 *           type: string
 *           format: password
 *           example: "newpassword"
 *     
 *     UpdateEmailRequest:
 *       type: object
 *       required:
 *         - email
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: "newemail@example.com"
 *     
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *     
 *     MfaEnrollResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         type:
 *           type: string
 *           example: "totp"
 *         totp:
 *           type: object
 *           properties:
 *             qr_code:
 *               type: string
 *               format: uri
 *             secret:
 *               type: string
 *     
 *     MfaVerifyRequest:
 *       type: object
 *       required:
 *         - factorId
 *         - code
 *       properties:
 *         factorId:
 *           type: string
 *         code:
 *           type: string
 *           example: "123456"
 *     
 *     MfaChallengeRequest:
 *       type: object
 *       required:
 *         - factorId
 *       properties:
 *         factorId:
 *           type: string
 *     
 *     MfaChallengeResponse:
 *       type: object
 *       properties:
 *         challengeId:
 *           type: string
 *     
 *     MfaVerifyChallengeRequest:
 *       type: object
 *       required:
 *         - factorId
 *         - challengeId
 *         - code
 *       properties:
 *         factorId:
 *           type: string
 *         challengeId:
 *           type: string
 *         code:
 *           type: string
 *           example: "123456"
 */
