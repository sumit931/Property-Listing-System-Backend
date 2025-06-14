const queries = require("./listingProperty.queries");
const { ObjectId } = require("mongodb");
const redis = require('../../helper/redisClient');
const { CACHE_TTL, PROPERTY_CACHE_TTL } = require('../../config');

exports.getProperties = async (req, res, next) => {
    try {
        const findQuery = {};
        
        // Convert string IDs to ObjectId
        if (req.query?.typeId) findQuery.typeId = new ObjectId(req.query.typeId);
        if (req.query?.stateId) findQuery.stateId = new ObjectId(req.query.stateId);
        if (req.query?.cityId) findQuery.cityId = new ObjectId(req.query.cityId);
        
        // Title search with case-insensitive regex
        if(req.query?.title) findQuery.title = { $regex: req.query.title, $options: 'i' };
        
        // Date filter
        if(req.query?.availableFrom) findQuery.availableFrom = { $lte: new Date(req.query.availableFrom) };
        
        // Price range
        if(req.query?.minPrice || req.query?.maxPrice) {
            findQuery.price = {};
            if(req.query?.minPrice) findQuery.price.$gte = Number(req.query.minPrice);
            if(req.query?.maxPrice) findQuery.price.$lte = Number(req.query.maxPrice);
        }
        
        // Numeric filters
        if(req.query?.minBedrooms) findQuery.bedrooms = { $gte: Number(req.query.minBedrooms) };
        if(req.query?.minBathrooms) findQuery.bathrooms = { $gte: Number(req.query.minBathrooms) };
        if(req.query?.minRating) findQuery.rating = { $gte: Number(req.query.minRating) };
        
        // String filters
        if(req.query?.listingType) findQuery.listingType = req.query.listingType;
        if(req.query?.furnished) findQuery.furnished = req.query.furnished;

        let processedAmenityIds = req.query?.amenityIds;
        if (processedAmenityIds && typeof processedAmenityIds === 'string') {
            processedAmenityIds = [processedAmenityIds];
        }

        let processedTagIds = req.query?.tagIds;
        if (processedTagIds && typeof processedTagIds === 'string') {
            processedTagIds = [processedTagIds];
        }

        if(processedAmenityIds) {
            findQuery.amenityIds = { $all: processedAmenityIds.map(id => new ObjectId(id)) };
        }
        if(processedTagIds) {
            findQuery.tagIds = { $all: processedTagIds.map(id => new ObjectId(id)) };
        }

        // Create a cache key based on the query parameters
        const cacheKey = `properties:${JSON.stringify(findQuery)}`;
        const cachedProperties = await redis.get(cacheKey);
        
        if (cachedProperties) {
            return res.status(200).json({ 
                message: "Properties fetched successfully from cache", 
                properties: JSON.parse(cachedProperties) 
            });
        }

        const result = await queries.getProperties(findQuery);
        await redis.setex(cacheKey, PROPERTY_CACHE_TTL, JSON.stringify(result));
        return res.status(200).json({ message: "Properties fetched successfully", properties: result });
    } catch (error) {
        console.error('Error fetching properties:', error);
        next(error);
    }
}

exports.postProperty = async (req, res, next) => {
    try {
        const propertyData = {
            ...req.body,
            id: Date.now().toString(),
            listerId: req.user.id,
            isVerified: false
        };
        
        const result = await queries.createProperty(propertyData);
        
        // Invalidate relevant caches
        await redis.del('properties:*');
        
        console.log('Property created successfully:', result);
        return res.status(201).json({ message: "Property listed successfully", property: result });
    } catch (error) {
        console.error('Error creating property:', error);
        next(error);
    }
}

exports.getMyProperties = async (req, res, next) => {
    try {
        const findQuery = {
            listerId: new ObjectId(req.user.id)
        }
        
        const cacheKey = `myProperties:${req.user.id}`;
        const cachedProperties = await redis.get(cacheKey);
        
        if (cachedProperties) {
            return res.status(200).json({ 
                message: "My properties fetched successfully from cache", 
                properties: JSON.parse(cachedProperties) 
            });
        }

        const myProperties = await queries.getMyProperties(findQuery);
        await redis.setex(cacheKey, PROPERTY_CACHE_TTL, JSON.stringify(myProperties));
        return res.status(200).json({ message: "My properties fetched successfully", properties: myProperties });
    } catch (error) {
        console.error('Error fetching my properties:', error);
        next(error);
    }
}

exports.deleteProperty = async (req, res, next) => {
    try {
        const propertyId = req.params.id;
        const deleteQuery = {
            _id: propertyId,
            listerId: new ObjectId(req.user.id)
        };

        const deletedProperty = await queries.deleteProperty(deleteQuery);
        
        if (!deletedProperty) {
            return res.status(404).json({ message: "Property not found or you don't have permission to delete it" });
        }
        
        // Invalidate relevant caches
        await redis.del('properties:*');
        await redis.del(`myProperties:${req.user.id}`);
        
        return res.status(200).json({ message: "Property deleted successfully", property: deletedProperty });
    } catch (error) {
        console.error('Error deleting property:', error);
        next(error);
    }
}

exports.updateProperty = async (req, res, next) => {
    try {
        const propertyId = req.params.id;
        const updateData = req.body;

        const updateQuery = {
            _id: new ObjectId(propertyId),
            listerId: new ObjectId(req.user.id) 
        };

        const updatedProperty = await queries.updateProperty(updateQuery, { $set: updateData });

        if (!updatedProperty) {
            return res.status(404).json({ message: "Property not found or you don't have permission to update it" });
        }

        // Invalidate relevant caches
        await redis.del('properties:*');
        await redis.del(`myProperties:${req.user.id}`);

        return res.status(200).json({ message: "Property updated successfully", property: updatedProperty });
    } catch (error) {
        console.error('Error updating property:', error);
        next(error);
    }
};

exports.getCity = async(req,res,next) => {
    try {
        const cacheKey = 'cities';
        const cachedCities = await redis.get(cacheKey);
        
        if (cachedCities) {
            return res.status(200).json({ 
                message: "Cities fetched successfully from cache", 
                cities: JSON.parse(cachedCities) 
            });
        }

        const cities = await queries.getCity();
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(cities));
        return res.status(200).json({ message: "Cities fetched successfully", cities });
    } catch (error) {
        console.error('Error fetching cities:', error);
        next(error);
    }
}

exports.getState = async(req,res,next) => {
    try {
        const cacheKey = 'states';
        const cachedStates = await redis.get(cacheKey);
        
        if (cachedStates) {
            return res.status(200).json({ 
                message: "States fetched successfully from cache", 
                states: JSON.parse(cachedStates) 
            });
        }

        const states = await queries.getState();
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(states));
        return res.status(200).json({ message: "States fetched successfully", states });
    } catch (error) {
        console.error('Error fetching states:', error);
        next(error);
    }
}

exports.getPropertyType = async(req,res,next) => {
    try {
        const cacheKey = 'propertyTypes';
        const cachedTypes = await redis.get(cacheKey);
        
        if (cachedTypes) {
            return res.status(200).json({ 
                message: "Property Types fetched successfully from cache", 
                propertyTypes: JSON.parse(cachedTypes) 
            });
        }

        const propertyTypes = await queries.getPropertyType();
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(propertyTypes));
        return res.status(200).json({ message: "Property Types fetched successfully", propertyTypes });
    } catch (error) {
        console.error('Error fetching property types:', error);
        next(error);
    }
}

exports.getPropertyTag = async(req,res,next) => {
    try {
        const cacheKey = 'propertyTags';
        const cachedTags = await redis.get(cacheKey);
        
        if (cachedTags) {
            return res.status(200).json({ 
                message: "Property Tags fetched successfully from cache", 
                propertyTags: JSON.parse(cachedTags) 
            });
        }

        const propertyTags = await queries.getPropertyTag();
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(propertyTags));
        return res.status(200).json({ message: "Property Tags fetched successfully", propertyTags });
    } catch (error) {
        console.error('Error fetching property tags:', error);
        next(error);
    }
}

exports.getAmenity = async(req,res,next) => {
    try {
        const cacheKey = 'amenities';
        const cachedAmenities = await redis.get(cacheKey);
        
        if (cachedAmenities) {
            return res.status(200).json({ 
                message: "Amenities fetched successfully from cache", 
                amenities: JSON.parse(cachedAmenities) 
            });
        }

        const amenities = await queries.getAmenity();
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(amenities));
        return res.status(200).json({ message: "Amenities fetched successfully", amenities });
    } catch (error) {
        console.error('Error fetching amenities:', error);
        next(error);
    }
}